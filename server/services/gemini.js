/**
 * CyberShield - Gemini AI Service
 * Wraps the official Google Gen AI SDK (@google/genai).
 *
 * Security notes:
 * - The API key lives ONLY in the server environment (loaded from .env).
 * - All four AI features funnel through this module so error handling,
 *   timeouts and safety settings stay in one place.
 * - Raw API errors are logged server-side; clients only ever receive
 *   friendly, generic messages.
 */

import { GoogleGenAI } from '@google/genai';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
// 12s per attempt: normal replies land well inside it; a hanging model trips
// the timeout fast so the request failovers to the fallback within seconds
// (was 60s originally, then 30s x2 attempts = ~65s before the fallback ran).
const TIMEOUT_MS = 12_000;

/** The exact message the frontend shows when Gemini is unreachable. */
export const AI_UNAVAILABLE_MESSAGE =
  'AI service is temporarily unavailable. Please try again.';

/** Message used when Gemini safety systems block the content. */
export const AI_BLOCKED_MESSAGE =
  'This content could not be analyzed. Please try different wording or a different image.';

export class AiServiceError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = 'AiServiceError';
    this.status = status;
  }
}

let client = null;

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_KEY_HERE') {
    console.error('[gemini] GEMINI_API_KEY is missing. Set it in the .env file.');
    throw new AiServiceError(AI_UNAVAILABLE_MESSAGE);
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/**
 * The SDK exposes response.text as a string property (older builds used a
 * function). Handle both so an SDK upgrade cannot break us.
 */
function extractText(response) {
  const text = response?.text;
  return typeof text === 'function' ? text() : text;
}

/** Strip accidental ``` fences before JSON.parse. */
function parseJsonLoose(text) {
  const trimmed = String(text || '').trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(unfenced);
}

function runWithTimeout(promise) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Gemini request timed out')), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A timeout/hang: no HTTP status, the request never completed. */
function isTimeoutErr(err) {
  return (
    /Gemini request timed out/.test(String(err?.message || '')) ||
    err?.name === 'TimeoutError' ||
    err?.name === 'AbortError' ||
    /ETIMEDOUT|ECONNRESET|ECONNABORTED/i.test(String(err?.cause?.code || err?.code || ''))
  );
}

/** True for rate-limit/capacity/hang errors where another attempt may help. */
function isTransient(err) {
  if (isTimeoutErr(err)) return true;
  const status = String(err?.status || err?.code || '');
  const raw = String(err?.message || '');
  return (
    status === '429' || status === '500' || status === '502' || status === '503' ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED|overload/i.test(raw)
  );
}

/**
 * Retry transient Gemini failures, strictly bounded:
 * - timeout/hang: NO retry on the same model (a hung model usually hangs
 *   again); withTransientRetry throws immediately and the caller failsovers
 *   to a different model, which is what actually helps.
 * - fast capacity errors (429/503): at most 2 attempts with a 1.5s pause.
 * - everything else (auth, invalid model, malformed request): fails fast.
 */
async function withTransientRetry(fn, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || isTimeoutErr(err) || i === attempts - 1) throw err;
      await sleep(1500);
    }
  }
  throw lastErr;
}

/**
 * Safe server-side diagnostics: classifies the failure so operators can tell
 * hang/capacity/auth apart, WITHOUT printing the API key or request content.
 */function logGeminiFailure(model, err, elapsedMs) {
  const status = String(err?.status || err?.code || '');
  const raw = String(err?.message || '');
  let kind;
  if (isTimeoutErr(err)) kind = 'timeout/hang (no response from upstream - not a key/auth problem)';
  else if (status === '429' || /RESOURCE_EXHAUSTED/i.test(raw)) kind = 'rate limited (quota)';
  else if (/API_KEY|PERMISSION|AUTH|UNAUTHENTICATED/i.test(status + ' ' + raw)) kind = 'auth rejected by Google - check GEMINI_API_KEY';
  else if (/not found|NOT_FOUND|INVALID_ARGUMENT/i.test(raw) && /model/i.test(raw)) kind = 'unsupported/invalid model id';
  else if (status === '503' || /UNAVAILABLE/i.test(raw)) kind = 'temporary service outage (503)';
  else if (status === '400') kind = 'malformed request rejected by Gemini';
  else kind = 'error';
  console.error(`[gemini] model=${model} fail=${kind} status=${status || 'none'} after ${elapsedMs != null ? elapsedMs + 'ms' : 'n/a'} detail=${raw.slice(0, 160)}`);
}

/**
 * generateContent with bounded retries + fallback model.
 * gemini-3.8-flash intermittently hangs at connect level or returns 503/429
 * on the free tier. Timeouts fail over immediately; fast capacity errors get
 * one retry; anything else fails fast. Worst case below (~26s) happens only
 * when BOTH models hang; typical failover answers in ~10-15s.
 */
async function generateWithFallback(config) {
  const ai = getClient();
  const attempt = (model) =>
    withTransientRetry(async () => {
      const started = Date.now();
      try {
        return await runWithTimeout(ai.models.generateContent({ model, ...config }));
      } catch (err) {
        logGeminiFailure(model, err, Date.now() - started);
        throw err;
      }
    });
  const t0 = Date.now();
  try {
    return await attempt(MODEL);
  } catch (err) {
    if (isTransient(err) && FALLBACK_MODEL && FALLBACK_MODEL !== MODEL) {
      console.warn(`[gemini] ${MODEL} unavailable, switching to fallback ${FALLBACK_MODEL}`);
      const result = await attempt(FALLBACK_MODEL);
      console.info(`[gemini] fallback ${FALLBACK_MODEL} served the request in ${Date.now() - t0}ms total`);
      return result;
    }
    throw err;
  }
}

/** Map any Gemini/SDK failure to a friendly AiServiceError (details stay in logs). */
function mapError(err) {
  const raw = String(err?.message || err || '');
  const status = err?.status || err?.code || '';
  console.error(`[gemini] request failed (status=${status}):`, raw);

  if (/SAFETY|BLOCK/i.test(raw)) throw new AiServiceError(AI_BLOCKED_MESSAGE, 422);
  throw new AiServiceError(AI_UNAVAILABLE_MESSAGE);
}

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

/**
 * Single-turn call.
 * @param {object} opts
 * @param {Array<object>} opts.parts   - Gemini content parts (text / inlineData).
 * @param {string} opts.systemInstruction
 * @param {object} [opts.schema]       - responseSchema for JSON output.
 * @param {number} [opts.temperature]
 * @returns {Promise<string>}
 */
async function callGemini({ parts, systemInstruction, schema, temperature = 0.3 }) {
  const ai = getClient();
  try {
    const response = await generateWithFallback({
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction,
        temperature,
        safetySettings: SAFETY_SETTINGS,
        ...(schema
          ? { responseMimeType: 'application/json', responseSchema: schema }
          : {}),
      },
    });

    const candidate = response?.candidates?.[0];
    const finish = candidate?.finishReason;
    if (finish && finish !== 'STOP') {
      console.error('[gemini] finishReason:', finish);
      throw new AiServiceError(
        finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'BLOCKLIST'
          ? AI_BLOCKED_MESSAGE
          : AI_UNAVAILABLE_MESSAGE,
        finish === 'SAFETY' ? 422 : 503
      );
    }

    const text = extractText(response);
    if (!text || !String(text).trim()) {
      console.error('[gemini] empty response');
      throw new AiServiceError(AI_UNAVAILABLE_MESSAGE);
    }
    return String(text);
  } catch (err) {
    if (err instanceof AiServiceError) throw err;
    throw mapError(err);
  }
}

/** Structured call: returns parsed JSON validated against `required` keys. */
async function callGeminiJson(opts, requiredKeys) {
  const text = await callGemini(opts);
  try {
    const data = parseJsonLoose(text);
    for (const key of requiredKeys) {
      if (!(key in data)) throw new Error(`missing key "${key}"`);
    }
    return data;
  } catch (err) {
    console.error('[gemini] invalid JSON response:', err.message);
    throw new AiServiceError(AI_UNAVAILABLE_MESSAGE);
  }
}

/* ------------------------------------------------------------------ */
/* Shared prompt rules                                                 */
/* ------------------------------------------------------------------ */

const HONESTY_RULES = `
NEVER claim certainty about whether something is a scam. Use wording such as
"AI assessment", "potential phishing", "likely suspicious", "verify independently".
Never invent details that are not present in the supplied content.
This platform serves college students in India - pay special attention to scams
common there (UPI/KYC/OTP frauds, fake job offers, courier/KYC threats, fake
investment groups, WhatsApp/SMS lures) but assess whatever is provided.
Never ask users for passwords, OTPs or other credentials.`;

/* ------------------------------------------------------------------ */
/* 1. Scam analyzer                                                    */
/* ------------------------------------------------------------------ */

const SCAM_SCHEMA = {
  type: 'OBJECT',
  properties: {
    risk_level: {
      type: 'STRING',
      description: 'Overall risk: LOW, MEDIUM or HIGH.',
    },
    threat_category: {
      type: 'STRING',
      description: 'Short category, e.g. "Phishing", "Smishing", "Fake job offer", "UPI fraud", "Legitimate (likely)".',
    },
    verdict: {
      type: 'STRING',
      description: '2-3 sentence AI verdict with hedged wording.',
    },
    red_flags: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Specific red flags found in the content (empty list if none).',
    },
    explanation: {
      type: 'STRING',
      description: 'Why the content is or is not suspicious, referencing only what is present.',
    },
    recommended_actions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Concrete defensive steps the user should take now.',
    },
    safety_tips: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'General tips to avoid this class of scam in future.',
    },
  },
  required: ['risk_level', 'threat_category', 'verdict', 'red_flags', 'explanation', 'recommended_actions', 'safety_tips'],
};

const SCAM_SYSTEM = `You are CyberShield's scam-analysis assistant, a DEFENSIVE cybersecurity
educator. You assess user-supplied messages (WhatsApp/SMS/email text, suspicious URLs,
or screenshots) and explain the warning signs so students learn to spot scams themselves.
${HONESTY_RULES}
If the content looks legitimate, say so honestly and still list anything worth double-checking.
If an image is unreadable or contains no message, say so in the verdict and set risk_level to LOW
with threat_category "Unable to analyze image". Keep each list item under 140 characters.
Answer with JSON only.`;

export async function analyzeScam({ text, image }) {
  const parts = [];
  if (text) parts.push({ text: `Message/URL to analyze:\n"""\n${text}\n"""` });
  if (image) {
    parts.push({
      text: 'The user also attached a screenshot of the suspicious message. Analyze what is visible.',
    });
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }

  const data = await callGeminiJson({ parts, systemInstruction: SCAM_SYSTEM, schema: SCAM_SCHEMA }, ['risk_level']);

  const risk = String(data.risk_level || '').toUpperCase();
  const norm = (v, fallback) =>
    Array.isArray(v) ? v.slice(0, 8).map((s) => String(s).slice(0, 300)) : fallback;

  return {
    risk_level: ['LOW', 'MEDIUM', 'HIGH'].includes(risk) ? risk : 'MEDIUM',
    threat_category: String(data.threat_category || 'Uncategorized').slice(0, 80),
    verdict: String(data.verdict || '').slice(0, 1200),
    red_flags: norm(data.red_flags, []),
    explanation: String(data.explanation || '').slice(0, 2000),
    recommended_actions: norm(data.recommended_actions, []),
    safety_tips: norm(data.safety_tips, []),
  };
}

/* ------------------------------------------------------------------ */
/* 2. AI tutor                                                         */
/* ------------------------------------------------------------------ */

const DIFFICULTY_GUIDE = {
  beginner: 'Beginner: plain language, no jargon (explain any term you must use), everyday Indian examples, keep it friendly and short (under ~180 words).',
  intermediate: 'Intermediate: assume basic security vocabulary (phishing, 2FA, malware), add practical depth and one concrete example (~250 words max).',
  advanced: 'Advanced: technical depth (protocols, mechanisms, defenses like DMARC/SPF/DKIM, FIDO2), nuance and trade-offs (~350 words max).',
};

const TUTOR_SYSTEM = `You are the CyberShield AI Tutor - a specialized cybersecurity AWARENESS tutor for
college students. You only teach DEFENSIVE security: understanding threats, recognizing scams,
and protecting accounts, devices, money and privacy. Follow the difficulty instruction given with
each question. Format answers with short markdown: bold key terms, bullet lists, and concrete
safe examples. ${DIFFICULTY_GUIDE.beginner}

STRICT SAFETY RULES:
- Refuse anything that facilitates attacks: hacking tutorials, credential theft, malware creation,
  phishing kit building, bypassing MFA/DRM, doxxing, or "how would a criminal do X".
  Instead, briefly redirect: explain the defensive side of the topic.
- If the question is unrelated to cybersecurity/online safety, politely say it is outside
  CyberShield's scope and offer a cybersecurity topic instead.
- Never request or repeat passwords, OTPs, card numbers or other secrets.
- Do not claim advice guarantees safety; encourage verification via official channels.
- For urgent incidents (hacked account, money stolen) tell the user to call India's 1930 cybercrime helpline and point to CyberShield's emergency response guide on the Toolkit page.`;

/**
 * Multi-turn tutor reply. History is supplied statelessly by the browser
 * (last N turns), so no conversation is stored server-side.
 */
export async function tutorReply({ message, difficulty, history = [] }) {
  const guide = DIFFICULTY_GUIDE[difficulty] || DIFFICULTY_GUIDE.beginner;

  const contents = [];
  for (const turn of history.slice(-12)) {
    const role = turn.role === 'model' ? 'model' : 'user';
    contents.push({ role, parts: [{ text: String(turn.text).slice(0, 1500) }] });
  }
  contents.push({
    role: 'user',
    parts: [{ text: `[Answer difficulty: ${difficulty.toUpperCase()}] ${guide}\n\nStudent question: ${message}` }],
  });

  const ai = getClient();
  try {
    const response = await generateWithFallback({
      contents,
      config: {
        systemInstruction: TUTOR_SYSTEM,
        temperature: 0.5,
        safetySettings: SAFETY_SETTINGS,
      },
    });

    const finish = response?.candidates?.[0]?.finishReason;
    if (finish && finish !== 'STOP') {
      console.error('[gemini] tutor finishReason:', finish);
      throw new AiServiceError(AI_BLOCKED_MESSAGE, 422);
    }
    const text = extractText(response);
    if (!text || !String(text).trim()) {
      throw new AiServiceError(AI_UNAVAILABLE_MESSAGE);
    }
    return { reply: String(text).slice(0, 6000) };
  } catch (err) {
    if (err instanceof AiServiceError) throw err;
    throw mapError(err);
  }
}

/* ------------------------------------------------------------------ */
/* 3. Personalized learning path                                       */
/* ------------------------------------------------------------------ */

const PATH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: '1-2 sentence encouraging summary of the performance.' },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', description: 'One of: Learn, Read, Practice, Take.' },
          title: { type: 'STRING', description: 'Short step title.' },
          description: { type: 'STRING', description: '1-2 sentences on what to do and why it helps.' },
          link: {
            type: 'STRING',
            description: 'CyberShield page id for this step, chosen ONLY from: home, password, quiz, news, threats, toolkit, glossary, resources, ai, about.',
          },
        },
        required: ['type', 'title', 'description', 'link'],
      },
      description: '4 to 6 ordered steps.',
    },
  },
  required: ['summary', 'steps'],
};

const PATH_SYSTEM = `You design short personalized learning paths for CyberShield, a cybersecurity
awareness platform for college students in India. Input is anonymous quiz performance data
(score, strong areas, weak areas). Rules:
- Produce 4-6 steps in a sensible order: learn the weakest topics first, then practice, then verify.
- "type" must be one of: Learn, Read, Practice, Take.
- "link" must be one of the allowed CyberShield page ids: home, password, quiz, news, threats,
  toolkit, glossary, resources, ai, about.
  (Practice -> quiz, Take -> quiz, Learn/Read -> threats/glossary/news/toolkit as fits,
  ai -> the AI CyberShield tutor.)
- Base every step ONLY on the provided performance data. Do not invent scores or topics.
- Tone: encouraging, concrete, student-friendly. Answer with JSON only.`;

export async function learningPath({ performance }) {
  const prompt =
    'Quiz performance data (anonymous):\n' +
    `Score: ${performance.score}% (${performance.correct}/${performance.total} correct)\n` +
    `Strong areas: ${performance.strongAreas.join(', ') || 'none identified'}\n` +
    `Needs improvement: ${performance.weakAreas.join(', ') || 'none - high overall score'}\n` +
    `Per-topic detail: ${JSON.stringify(performance.categoryStats)}\n\n` +
    'Generate the personalized learning path.';

  const data = await callGeminiJson(
    { parts: [{ text: prompt }], systemInstruction: PATH_SYSTEM, schema: PATH_SCHEMA, temperature: 0.4 },
    ['summary', 'steps']
  );

  const ALLOWED_LINKS = ['home', 'password', 'quiz', 'news', 'threats', 'toolkit', 'glossary', 'resources', 'ai', 'about'];
  const ALLOWED_TYPES = ['Learn', 'Read', 'Practice', 'Take'];

  const steps = (Array.isArray(data.steps) ? data.steps : [])
    .slice(0, 6)
    .map((s) => ({
      type: ALLOWED_TYPES.includes(s?.type) ? s.type : 'Learn',
      title: String(s?.title || 'Next step').slice(0, 90),
      description: String(s?.description || '').slice(0, 300),
      link: ALLOWED_LINKS.includes(s?.link) ? s.link : 'quiz',
    }));

  return { summary: String(data.summary || '').slice(0, 500), steps };
}

/* ------------------------------------------------------------------ */
/* 4. News explainer                                                   */
/* ------------------------------------------------------------------ */

const NEWS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    simple_summary: { type: 'STRING', description: 'The incident explained in 2-3 simple sentences, using ONLY the supplied article info.' },
    threat_category: { type: 'STRING', description: 'Short threat category, e.g. "Ransomware", "Phishing campaign".' },
    who_affected: { type: 'STRING', description: 'Who may be affected, based only on the article info (say if unclear).' },
    why_it_matters: { type: 'STRING', description: 'Why this incident matters for ordinary users/students.' },
    key_lessons: { type: 'ARRAY', items: { type: 'STRING' }, description: '2-4 key lessons to take away.' },
    defensive_actions: { type: 'ARRAY', items: { type: 'STRING' }, description: '3-5 general defensive actions (clearly general advice, not claims from the article).' },
  },
  required: ['simple_summary', 'threat_category', 'who_affected', 'why_it_matters', 'key_lessons', 'defensive_actions'],
};

const ASK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING', description: 'Answer to the question. Use only article info; if the article does not cover it, say so and add clearly-labeled general cybersecurity guidance.' },
  },
  required: ['answer'],
};

function articleBlock(article) {
  return [
    `Title: ${article.title}`,
    article.source ? `Source: ${article.source}` : '',
    article.date ? `Published: ${article.date}` : '',
    article.category ? `Editor category: ${article.category}` : '',
    article.excerpt ? `Article summary: ${article.excerpt}` : '',
    article.advice ? `Protection advice attached to the article: ${article.advice}` : '',
    Array.isArray(article.tags) && article.tags.length ? `Tags: ${article.tags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const NEWS_EXPLAIN_SYSTEM = `You are CyberShield's news explainer. You receive the information about ONE
cybersecurity news article that is available inside the app (title, summary, source, category, tags,
attached advice). Explain it simply for college students.

CRITICAL GROUNDING RULES:
- Base simple_summary, threat_category, who_affected and key_lessons ONLY on the supplied article
  information. If something is not covered (e.g. number of victims, named companies), say it is not
  specified rather than inventing it.
- defensive_actions must be GENERAL cybersecurity advice for this type of threat - do not attribute
  it to the article.
- Keep language simple and jargon-free. Answer with JSON only.`;

const NEWS_ASK_SYSTEM = `You are CyberShield's news assistant. You are given the information available in
the app about ONE article plus a user question. Answer ONLY from the supplied article information.
If the article information does not contain the answer, state that clearly, then optionally add a
short paragraph starting with "General cybersecurity advice:" that helps the user stay safe.
Never invent article details. Keep the answer under 250 words. Plain text with simple markdown.`;

export async function explainNews({ article }) {
  const prompt = `Article information available in the app:\n${articleBlock(article)}\n\nGenerate the structured explanation.`;
  const data = await callGeminiJson(
    { parts: [{ text: prompt }], systemInstruction: NEWS_EXPLAIN_SYSTEM, schema: NEWS_SCHEMA, temperature: 0.35 },
    ['simple_summary']
  );

  const list = (v, max = 5) =>
    Array.isArray(v) ? v.slice(0, max).map((s) => String(s).slice(0, 300)) : [];

  return {
    simple_summary: String(data.simple_summary || '').slice(0, 1200),
    threat_category: String(data.threat_category || 'Cyber threat').slice(0, 80),
    who_affected: String(data.who_affected || 'Not specified in the article').slice(0, 600),
    why_it_matters: String(data.why_it_matters || '').slice(0, 800),
    key_lessons: list(data.key_lessons, 4),
    defensive_actions: list(data.defensive_actions, 5),
  };
}

export async function askAboutNews({ article, question }) {
  const prompt = `Article information available in the app:\n${articleBlock(article)}\n\nUser question: ${question}`;
  const data = await callGeminiJson(
    { parts: [{ text: prompt }], systemInstruction: NEWS_ASK_SYSTEM, schema: ASK_SCHEMA, temperature: 0.4 },
    ['answer']
  );
  return { answer: String(data.answer || '').slice(0, 4000) };
}
