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
// 12s for the primary: normal replies land well inside it; a hanging model
// trips the timeout fast so the request failovers to the fallback within
// seconds. The fallback gets 20s: live testing showed the lightweight model
// legitimately needs ~14s under load, and the old 12s cap was killing
// requests the fallback was actually about to answer (server.log showed
// "Gemini request timed out" at 12015ms on gemini-3.5-flash-lite).
const PRIMARY_TIMEOUT_MS = 12_000;
const FALLBACK_TIMEOUT_MS = 20_000;

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

function runWithTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Gemini request timed out')), timeoutMs);
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
 * Retry transient Gemini failures with EXPONENTIAL BACKOFF, strictly bounded:
 * - timeout/hang: NO retry on the same model (a hung model usually hangs
 *   again) - withTransientRetry throws immediately and the caller failsovers
 *   to a different model, which is what actually helps.
 * - fast transient errors (429/503/502): up to `attempts` tries, waiting
 *   baseDelay * 2^i (capped) plus jitter between them - Google's 503s are
 *   usually brief capacity spikes, so a short pause often clears them.
 * - everything else (auth 401/403, invalid model 404, malformed request
 *   400): fails fast - retrying permanent errors can never help.
 */
function backoffDelayMs(baseMs, attemptNo, capMs = 5_000) {
  const exponential = Math.min(baseMs * 2 ** attemptNo, capMs);
  // +/- 40% jitter so parallel requests don't retry in lockstep.
  return Math.round(exponential * (0.6 + Math.random() * 0.8));
}

async function withTransientRetry(
  fn,
  { attempts = 2, baseDelayMs = 1500, model = '' } = {}
) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || isTimeoutErr(err) || i === attempts - 1) throw err;
      const delay = backoffDelayMs(baseDelayMs, i);
      console.warn(`[gemini] ${model || 'model'} transient error -> retry ${i + 2}/${attempts} in ${delay}ms`);
      await sleep(delay);
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
 * gemini-3.8-flash intermittently returns 503/429 ("high demand") on the
 * free tier - ONE in-model retry with exponential backoff clears most of
 * them; stubborn failures (and any hang) fail over to the different fallback
 * model, which is what actually helps. Timeouts never retry on the same
 * model. Requests still running when the per-model cap hits are answered by
 * the other model; anything else fails fast (auth/400s) or surfaces the
 * friendly AI_UNAVAILABLE_MESSAGE. Worst case (BOTH models hang) adds up to
 * roughly a minute; typical failover answers in ~10-15s.
 */
async function generateWithFallback(config) {
  const ai = getClient();
  const attempt = (model, timeoutMs) =>
    withTransientRetry(
      async () => {
        const started = Date.now();
        try {
          return await runWithTimeout(
            ai.models.generateContent({ model, ...config }),
            timeoutMs
          );
        } catch (err) {
          logGeminiFailure(model, err, Date.now() - started);
          throw err;
        }
      },
      { attempts: 2, baseDelayMs: 1500, model }
    );
  const t0 = Date.now();
  try {
    return await attempt(MODEL, PRIMARY_TIMEOUT_MS);
  } catch (err) {
    if (isTransient(err) && FALLBACK_MODEL && FALLBACK_MODEL !== MODEL) {
      console.warn(`[gemini] ${MODEL} unavailable, switching to fallback ${FALLBACK_MODEL}`);
      const result = await attempt(FALLBACK_MODEL, FALLBACK_TIMEOUT_MS);
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
      description: 'Overall risk: LOW, MEDIUM, HIGH or CRITICAL.',
    },
    risk_score: {
      type: 'INTEGER',
      description: 'Numeric estimate of scam likelihood, 0-100, consistent with risk_level (roughly: LOW 1-30, MEDIUM 31-60, HIGH 61-85, CRITICAL 86-100). 0 only for analysis errors.',
    },
    threat_category: {
      type: 'STRING',
      description: 'Short category, e.g. "Phishing", "Smishing", "Fake prize offer", "OTP theft attempt", "UPI fraud", "Urgent payment demand", "Impersonation", "Social engineering", "Suspicious personal-info request", "Legitimate (likely)".',
    },
    verdict: {
      type: 'STRING',
      description: '2-3 sentence AI verdict with hedged wording.',
    },
    suspicious_phrases: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Short EXACT phrases copied from the supplied content that raise concern, in quotes (empty if none). Never invent phrases.',
    },
    red_flags: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Warning signs / reasons for the risk classification, referencing only what is actually present (empty list only if genuinely questionable-looking content has none).',
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
  required: ['risk_level', 'risk_score', 'threat_category', 'verdict', 'suspicious_phrases', 'red_flags', 'explanation', 'recommended_actions', 'safety_tips'],
};

const SCAM_SYSTEM = `You are CyberShield's scam-analysis assistant, a DEFENSIVE cybersecurity
educator. You assess user-supplied messages (SMS/WhatsApp/email text, social-media messages,
banking or payment messages, suspicious URLs, or screenshots) and explain the warning signs
so students learn to spot scams themselves. Focus on: phishing, fake offers/prizes, OTP/credential
theft attempts, urgent payment demands, impersonation, social engineering, and suspicious requests
for personal information.
${HONESTY_RULES}
URL SPECIAL RULES: if analytical findings from an automated structural URL check are supplied,
treat them as machine-detected facts, mention the relevant ones and add anything they miss.
NEVER claim a URL is malicious or safe based ONLY on HTTPS availability or general appearance -
HTTPS/HTTP says nothing by itself, and structural oddities are hints, not proof. If NO URL
findings were supplied and a URL is present, say clearly that no automated domain check was
performed. If the content looks legitimate, say so honestly ("AI assessment", never certainty)
and still list anything worth double-checking. Never state that a message is "definitely safe".
If an image is unreadable or contains no message, say so in the verdict and set risk_level to LOW
with threat_category "Unable to analyze image". Keep each list item under 140 characters.
Answer with JSON only.`;

export async function analyzeScam({ text, image, urlContext }) {
  const parts = [];
  if (urlContext) parts.push({ text: `Automated structural URL check (machine-detected, performed WITHOUT visiting the URL):\n${urlContext}\n(Use these findings; do not contradict them; do not treat HTTPS availability as a safety verdict.)` });
  if (text) parts.push({ text: `Message/URL to analyze:\n"""\n${text}\n"""` });
  if (image) {
    parts.push({
      text: 'The user also attached a screenshot of the suspicious message. Analyze what is visible.',
    });
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }

  const data = await callGeminiJson({ parts, systemInstruction: SCAM_SYSTEM, schema: SCAM_SCHEMA }, [
    'risk_level',
    'threat_category',
    'verdict',
    'explanation',
    'recommended_actions',
  ]);

  const risk = String(data.risk_level || '').toUpperCase();
  const riskLevel = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(risk) ? risk : 'MEDIUM';

  // Server-side validation of the AI's risk score: clamp to 0-100 and keep it
  // roughly consistent with the delivered risk level (never trust model output).
  const LEVEL_MID = { LOW: 20, MEDIUM: 50, HIGH: 75, CRITICAL: 93 };
  let score = Math.round(Number(data.risk_score));
  if (!Number.isFinite(score)) score = LEVEL_MID[riskLevel];
  score = Math.max(0, Math.min(100, score));
  if (riskLevel === 'CRITICAL' && score < 60) score = 60;
  if (riskLevel === 'LOW' && score > 40) score = 40;

  const norm = (v, fallback) =>
    Array.isArray(v) ? v.slice(0, 8).map((s) => String(s).slice(0, 300)) : fallback;

  return {
    risk_level: riskLevel,
    risk_score: score,
    threat_category: String(data.threat_category || 'Uncategorized').slice(0, 80),
    verdict: String(data.verdict || '').slice(0, 1200),
    suspicious_phrases: norm(data.suspicious_phrases, []),
    red_flags: norm(data.red_flags, []),
    explanation: String(data.explanation || '').slice(0, 2000),
    recommended_actions: norm(data.recommended_actions, []),
    safety_tips: norm(data.safety_tips, []),
  };
}

/* ------------------------------------------------------------------ */
/* 1b. Quiz question generation (admin-triggered batches)              */
/* ------------------------------------------------------------------ */

const QUESTION_BATCH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING', description: 'The question, one clear sentence or a short scenario.' },
          options: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Exactly four plausible, distinct answer options.',
          },
          correct: {
            type: 'INTEGER',
            description: 'Zero-based index (0-3) of the single correct option.',
          },
          explanation: {
            type: 'STRING',
            description: 'One or two educational sentences explaining why the answer is correct.',
          },
          subtopic: {
            type: 'STRING',
            description: 'Specific subtopic, e.g. "Cloud Security", "Wi-Fi Security", "Cryptography Basics".',
          },
        },
        required: ['text', 'options', 'correct', 'explanation', 'subtopic'],
      },
    },
  },
  required: ['questions'],
};

const QUESTION_GEN_SYSTEM = `You write multiple-choice questions for CyberShield, a defensive
cybersecurity AWARENESS quiz for college students in India.

Rules for every question:
- Technically accurate and unambiguous; exactly ONE option is correct.
- Exactly four options, all plausible, mutually exclusive and distinct.
- No joke options, no "all of the above", no trick wording.
- "correct" is the zero-based index (0-3) of the correct option.
- Explanation: 1-2 sentences teaching WHY the answer is right.
- Difficulty must genuinely match the requested level.
- Never ask how to attack, steal credentials, build malware or bypass security.
- No duplicate or reworded versions of the avoid-list questions.
- Practical, beginner-friendly language; avoid obscure trivia.
Answer with JSON only.`;

export async function generateQuizQuestions({ topicLabel, difficulty, count, existingTexts = [] }) {
  const avoid = existingTexts.length
    ? `\nDo NOT repeat or lightly reword any of these existing questions:\n${existingTexts
        .map((text) => `- ${String(text).slice(0, 160)}`)
        .join('\n')}`
    : '';

  const prompt =
    `Write ${count} new ${difficulty.toUpperCase()} difficulty multiple-choice questions about ` +
    `"${topicLabel}" for a cybersecurity awareness quiz.\n` +
    'Each question must have exactly four options and one correct answer.\n' +
    'Also include a specific subtopic (for example: Email Security, Cloud Security, Mobile Security, ' +
    'Wi-Fi Security, Cryptography Basics, Authentication and Access Control, Cyber Laws, ' +
    'Digital Forensics and Incident Response).' +
    avoid;

  const data = await callGeminiJson(
    { parts: [{ text: prompt }], systemInstruction: QUESTION_GEN_SYSTEM, schema: QUESTION_BATCH_SCHEMA, temperature: 0.7 },
    ['questions']
  );

  return Array.isArray(data.questions) ? data.questions : [];
}

/* ------------------------------------------------------------------ */
/* 2. AI tutor                                                         */
/* ------------------------------------------------------------------ */

const DIFFICULTY_GUIDE = {
  beginner: 'Beginner: plain language, no unexplained jargon, everyday Indian examples, short sentences. Aim for 150-250 words.',
  intermediate: 'Intermediate: assume basic security vocabulary (phishing, 2FA, malware), add practical depth and one concrete example. Aim for 250-400 words.',
  advanced: 'Advanced: technical depth (protocols, mechanisms, defenses such as DMARC/SPF/DKIM, FIDO2/passkeys), nuance and trade-offs. Aim for 350-550 words.',
};

const TUTOR_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: {
      type: 'STRING',
      description: 'The tutoring answer in markdown. Direct answer first, then short bold sections, with numbered steps where a procedure helps.',
    },
    keyTakeaways: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: '2-4 short key takeaways the learner should remember.',
    },
    followUps: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: '2-3 natural follow-up questions the learner could ask next.',
    },
    topic: {
      type: 'STRING',
      description: 'Closest topic slug from: phishing-social, password-security, malware-ransomware, network-security, identity-theft, financial-fraud, data-privacy, safe-browsing, emerging-threats, or general.',
    },
    practicePage: {
      type: 'STRING',
      description: 'Optional single CyberShield page id for practice: home, password, quiz, news, threats, toolkit, glossary, resources, ai, about.',
    },
    practiceLabel: {
      type: 'STRING',
      description: 'Short human label for that page, e.g. "Password Checker".',
    },
  },
  required: ['answer', 'keyTakeaways', 'followUps', 'topic'],
};

const TUTOR_SYSTEM = `You are the CyberShield AI Cybersecurity Tutor for college students in India.
You teach DEFENSIVE security only: understanding threats, recognizing scams, and protecting
accounts, devices, money and privacy.

ANSWER SHAPE
- Start with a direct answer in 1-2 sentences.
- Use short markdown sections with bold headings and bullets. Use numbered steps for procedures.
- Include one concrete defensive example that fits student life in India (UPI/OTP fraud, fake job
  offers, hostel or public Wi-Fi, WhatsApp and Instagram account theft) when relevant.
- Include 2-4 key takeaways and 2-3 follow-up questions the learner could ask next.
- When the learner asks for a step-by-step explanation, put the steps in order and say what to
  check after each one.

PERSONALIZATION
- Use ONLY the measured learner facts supplied in the request. Never invent scores, attempts,
  weak topics or a level.
- If weak topics are supplied and the question relates to one, mention it once and connect the
  explanation to it. Do not list the whole profile back at the learner.
- Match the requested explanation level exactly.
- Offer at most one CyberShield practice page from the allowed list.

SAFETY (non-negotiable)
- Refuse actionable attack instructions: hacking, credential theft, malware or keylogger creation,
  phishing kits or fake login pages, bypassing MFA or security controls, cracking Wi-Fi, doxxing.
  Briefly redirect to the defensive side of the topic instead.
- Conceptual questions about how attacks work are allowed at a high level, but never with
  step-by-step operational detail or code.
- If the question is unrelated to cybersecurity, say it is outside CyberShield's scope and offer a
  security topic instead.
- Never request, repeat or echo passwords, OTPs, card numbers or other secrets.
- Do not claim advice guarantees safety; recommend verifying through official channels.
- For active incidents (account taken over, money stolen) tell the user to call India's 1930
  cybercrime helpline and point to CyberShield's Toolkit emergency guide.

Answer with JSON only.`;

/**
 * Multi-turn tutor answer. History comes from the server-stored conversation
 * (never from the browser), and `learner` is the measured personalization
 * block built by services/tutor.js. Returns validated-shape JSON that the
 * route sanitizes before storage.
 */
export async function tutorAnswer({ message, difficulty = 'beginner', history = [], learner = '' }) {
  const guide = DIFFICULTY_GUIDE[difficulty] || DIFFICULTY_GUIDE.beginner;

  const contents = [];
  for (const turn of history.slice(-12)) {
    const role = turn.role === 'model' ? 'model' : 'user';
    const text = String(turn.text || '').slice(0, 4000);
    if (text) contents.push({ role, parts: [{ text }] });
  }
  contents.push({
    role: 'user',
    parts: [
      {
        text:
          `[Explanation level: ${difficulty.toUpperCase()}]\n${guide}\n\n` +
          `${learner || 'Learner profile: no measured quiz data.'}\n\n` +
          `Student question: ${message}\n\n` +
          'Answer with JSON only, following the required schema.',
      },
    ],
  });

  const ai = getClient();
  try {
    const response = await generateWithFallback({
      contents,
      config: {
        systemInstruction: TUTOR_SYSTEM,
        temperature: 0.45,
        safetySettings: SAFETY_SETTINGS,
        responseMimeType: 'application/json',
        responseSchema: TUTOR_SCHEMA,
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

    const data = parseJsonLoose(text);
    for (const key of ['answer', 'keyTakeaways', 'followUps', 'topic']) {
      if (!(key in data)) throw new Error(`missing key "${key}"`);
    }
    return data;
  } catch (err) {
    if (err instanceof AiServiceError) throw err;
    if (/^missing key /.test(String(err?.message || ''))) {
      throw new AiServiceError(AI_UNAVAILABLE_MESSAGE);
    }
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
/* 3b. Personalized learning ROADMAP (staged, tracked)                 */
/* ------------------------------------------------------------------ */

const ROADMAP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'Short encouraging title for this roadmap.' },
    summary: { type: 'STRING', description: '2-3 sentences explaining the focus, based ONLY on the supplied measured performance.' },
    lessons: {
      type: 'ARRAY',
      description: '6 to 10 ordered lessons covering Beginner, Intermediate and Advanced stages.',
      items: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING', description: 'Exactly one of the supplied topic slugs.' },
          stage: { type: 'STRING', description: 'One of: Beginner, Intermediate, Advanced.' },
          difficulty: { type: 'STRING', description: 'One of: easy, medium, hard (match the stage).' },
          title: { type: 'STRING', description: 'Short lesson title.' },
          objective: { type: 'STRING', description: 'What the learner will be able to do after this lesson.' },
          why: { type: 'STRING', description: 'Why this topic is recommended for THIS learner, referencing only the supplied measured accuracy. Never invent scores.' },
          estimatedMinutes: { type: 'INTEGER', description: 'Study time in minutes, 10-90.' },
          type: { type: 'STRING', description: 'One of: Learn, Read, Practice, Take.' },
          description: { type: 'STRING', description: '1-2 sentences describing the activity.' },
          resource: { type: 'STRING', description: 'CyberShield page id from: home, password, quiz, news, threats, toolkit, glossary, resources, ai, about.' },
          resourceLabel: { type: 'STRING', description: 'Human label for that page.' },
          exercise: { type: 'STRING', description: 'One concrete practical exercise the learner can complete.' },
        },
        required: ['topic', 'stage', 'difficulty', 'title', 'objective', 'why', 'estimatedMinutes', 'type', 'description', 'resource', 'resourceLabel', 'exercise'],
      },
    },
  },
  required: ['title', 'summary', 'lessons'],
};

const ROADMAP_SYSTEM = `You build a personalized, staged cybersecurity learning roadmap for a
college student in India, using ONLY the measured quiz performance supplied.

Rules:
- Never invent scores, topics, attempts or weaknesses. If a topic has no measured accuracy, do not
  claim it is weak; the supplied data says which topics were actually measured.
- Prioritise the learner's weakest measured topics first, then other measured topics.
- Produce 6-10 lessons with a sensible progression: Beginner, Intermediate, Advanced. Every stage
  must appear at least once.
- topic MUST be one of the supplied topic slugs (copy it exactly).
- stage is Beginner, Intermediate or Advanced; difficulty is easy, medium or hard and must match:
  Beginner=easy, Intermediate=medium, Advanced=hard.
- Every lesson needs one concrete exercise and one CyberShield page resource from the allowed list.
- Explain in "why" why this learner should study this topic now, quoting only measured accuracy.
- Defensive, beginner-friendly, no offensive security instructions. Answer with JSON only.`;

export async function personalizedRoadmap({ profile, attempts }) {
  const topics = [
    'phishing-social', 'password-security', 'malware-ransomware', 'network-security',
    'identity-theft', 'financial-fraud', 'data-privacy', 'safe-browsing', 'emerging-threats',
  ];
  const measured = (profile.topicPerformance || []).map((t) => ({
    topic: t.topic,
    accuracy: t.accuracy,
    correct: t.correct,
    total: t.total,
  }));

  const prompt =
    'Measured quiz performance (the ONLY performance facts you may use):\n' +
    `Saved quiz attempts: ${attempts}\n` +
    `Current difficulty: ${profile.currentDifficulty}\n` +
    `Average score: ${profile.averageScore == null ? 'not measured yet' : profile.averageScore + '%'}\n` +
    `Latest score: ${profile.lastScore == null ? 'not measured yet' : profile.lastScore + '%'}\n` +
    `Topic accuracy (measured): ${JSON.stringify(measured)}\n` +
    `Weakest topics: ${JSON.stringify((profile.weakTopics || []).map((t) => t.topic))}\n` +
    `Strongest topics: ${JSON.stringify((profile.strongTopics || []).map((t) => t.topic))}\n` +
    `All allowed topic slugs: ${topics.join(', ')}\n` +
    'Build the staged roadmap now.';

  const data = await callGeminiJson(
    { parts: [{ text: prompt }], systemInstruction: ROADMAP_SYSTEM, schema: ROADMAP_SCHEMA, temperature: 0.5 },
    ['title', 'summary', 'lessons']
  );
  return data;
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
