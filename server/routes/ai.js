/**
 * CyberShield - AI API routes
 *
 * POST /api/ai/scam-analyze    { text?, imageBase64?, imageMime? }
 * POST /api/ai/tutor           { message, difficulty, history? }
 * POST /api/ai/learning-path   { score, total, correct, strongAreas, weakAreas, categoryStats }
 * POST /api/ai/news-explain    { article, question? }
 *
 * All routes: strict input validation, per-route body limits, friendly errors
 * (raw Gemini/backend errors never reach the client).
 */

import express, { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import {
  analyzeScam,
  tutorAnswer,
  learningPath,
  explainNews,
  askAboutNews,
  AiServiceError,
} from '../services/gemini.js';
import { analyzeUrl } from '../services/url-analyzer.js';
import {
  buildFallbackReply,
  buildLearnerPrompt,
  detectUnsafeRequest,
  loadLearnerContext,
  normalizeTutorReply,
  serializeConversation,
  MAX_MESSAGE_LENGTH,
  MAX_STORED_MESSAGES,
  MAX_HISTORY_TURNS,
  LEVELS,
} from '../services/tutor.js';
import { TutorConversation } from '../models/index.js';
import { requireAuth, sameOriginGuard } from '../middleware/auth.js';
import { TOPIC_LABELS, DIFFICULTIES } from '../services/adaptive.js';

const router = Router();

/**
 * Trim and clamp a string, or return null when empty/invalid.
 */
function str(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  return s ? s.slice(0, max) : null;
}

function strArray(v, maxItems, maxLen) {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item) => typeof item === 'string' && item.trim())
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxLen));
}

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const MAX_IMAGE_BASE64 = 14_000_000; // ~10.5 MB binary

function validImage(mime, base64) {
  if (typeof mime !== 'string' || !ALLOWED_IMAGE_MIMES.has(mime.toLowerCase())) return false;
  if (typeof base64 !== 'string' || !base64 || base64.length > MAX_IMAGE_BASE64) return false;
  return /^[A-Za-z0-9+/=\r\n]$/.test(base64.slice(0, 1024)) && /^[A-Za-z0-9+/=\s]$/.test(base64);
}

/** Strip a data-URL prefix if a client sends one. */
function stripDataUrl(mime, base64) {
  if (typeof base64 !== 'string') return { mime, base64 };
  const match = base64.match(/^data:([^;,]+);base64,(.*)$/s);
  if (match) return { mime: match[1], base64: match[2] };
  return { mime, base64 };
}

function sendError(res, err) {
  if (err instanceof AiServiceError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('[ai-route] unexpected error:', err?.message || err);
  return res.status(503).json({ error: 'AI service is temporarily unavailable. Please try again.' });
}

/* -------------------- 1. Scam analyzer -------------------- */

router.post(
  '/scam-analyze',
  express.json({ limit: '12mb' }), // room for base64 screenshots only on this route
  async (req, res) => {
    try {
      // SECURITY NOTE: request bodies are NEVER logged (they can contain
      // passwords/OTPs users were tricked into pasting). Only error TYPES
      // reach the log files.
      let { text, url, imageBase64, imageMime } = req.body || {};
      text = str(text, 6000);

      // Optional dedicated URL input. Parsed structurally only - the analyzer
      // NEVER visits, downloads or executes it (no outbound request exists in
      // that module), so there is no SSRF surface here.
      let urlAnalysis = null;
      const urlInput = str(url, 2048);
      if (urlInput) {
        urlAnalysis = analyzeUrl(urlInput);
        if (!urlAnalysis.ok) {
          return res.status(400).json({
            error: "That doesn't look like a valid web address. Enter a URL such as 'https://example.com/page' and try again.",
          });
        }
      }

      let image = null;
      if (imageBase64) {
        const cleaned = stripDataUrl(imageMime, imageBase64);
        if (!validImage(cleaned.mime, cleaned.base64)) {
          return res.status(400).json({ error: 'Unsupported or oversized image. Please upload a PNG, JPG or WebP screenshot under 10 MB.' });
        }
        image = { mimeType: cleaned.mime === 'image/jpg' ? 'image/jpeg' : cleaned.mime, data: cleaned.base64.replace(/\s/g, '') };
      }

      if (!text && !image && !urlAnalysis) {
        return res.status(400).json({ error: 'Paste a suspicious message or URL first, or attach a screenshot.' });
      }

      const result = await analyzeScam({
        text,
        image,
        urlContext: urlAnalysis
          ? urlAnalysis.summary +
            (urlAnalysis.warnings.length
              ? '\nWarnings (machine-detected): ' + urlAnalysis.warnings.map((w) => w.headline).join('; ')
              : '')
          : null,
      });

      // Structural URL findings from OUR checker - separate from the AI's
      // verdict so the frontend can show both side by side.
      if (urlAnalysis) {
        result.url_analysis = {
          host: urlAnalysis.host,
          registrable_domain: urlAnalysis.registrableDomain || null,
          scheme_given: urlAnalysis.schemeGiven,
          /* HTTPS presence alone is NOT a safety verdict - shown only as a fact. */
          http_warning: urlAnalysis.warnings.some((w) => w.headline === 'No encryption (plain HTTP)'),
          warnings: urlAnalysis.warnings.slice(0, 10),
        };
      }

      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  }
);

/* ----------------------- 2. AI tutor ------------------------- */

/**
 * SIGNED-IN ONLY. Every response is written to the signed-in user's
 * TutorConversation document so follow-up questions keep their real context,
 * and the browser can never load another account's chat.
 */

const tutorLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40, // 40 tutor messages per 10 min per signed-in user
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.session?.user?.id || ipKeyGenerator(req.ip),
  message: { error: 'Too many tutor messages for now. Please wait a moment and try again.' },
});

router.post('/tutor', requireAuth, sameOriginGuard, tutorLimiter, express.json({ limit: '100kb' }), async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    // Validate input length before anything else.
    const raw = req.body?.message;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return res.status(400).json({ error: 'Type a question for the AI tutor first.' });
    }
    if (raw.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Questions must be ${MAX_MESSAGE_LENGTH} characters or fewer.` });
    }
    const clean = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();

    const difficulty = LEVELS.includes(req.body?.difficulty) ? req.body.difficulty : 'beginner';

    // Persistence + personalization in parallel.
    const existingConversation = await TutorConversation.findOne({ userId }).sort({ lastMessageAt: -1, createdAt: -1 }).lean();
    const savedConversation = serializeConversation(existingConversation);
    const context = await loadLearnerContext(userId);
    const history = savedConversation
      ? savedConversation.messages.slice(-MAX_HISTORY_TURNS).map((m) => ({ role: m.role, text: m.text }))
      : [];

    const contextBlock = buildLearnerPrompt(context);

    // Deterministic guard: actionable attack asks are redirected before any AI call.
    const unsafe = detectUnsafeRequest(clean);

    // The result shape we persist and return.
    let result = {
      reply: '', keyTakeaways: [], followUps: [], topic: 'general',
      practice: null, generatedBy: 'curated', safety: 'ok', notice: null,
    };

    if (unsafe) {
      // Redirect attack requests to a safe, curated answer instead of asking
      // Gemini for instructions that would harm others.
      const safe = buildFallbackReply({ message: clean, difficulty, context, unsafe: true });
      result.reply = safe.reply;
      result.keyTakeaways = safe.keyTakeaways;
      result.followUps = safe.followUps;
      result.topic = safe.topic;
      result.practice = safe.practice;
      result.generatedBy = safe.generatedBy;
      result.safety = safe.safety;
      result.notice = safe.notice;
    } else {
      let aiResult = null;
      const keyReady = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_API_KEY_HERE';

      if (keyReady) {
        try {
          const rawAi = await tutorAnswer({ message: clean, difficulty, history, learner: contextBlock });
          aiResult = normalizeTutorReply(rawAi, { difficulty, context });
        } catch (tutorErr) {
          console.warn('[tutor] ai failed, falling back to curated reply:', tutorErr?.message || tutorErr);
        }
      }

      if (!aiResult) {
        const fallback = buildFallbackReply({
          message: clean, difficulty, context, unsafe: false,
          reason: keyReady
            ? 'AI is temporarily unavailable - a short reviewed guide is shown instead.'
            : 'AI is not configured yet - a short reviewed guide is shown instead.',
        });
        result.reply = fallback.reply;
        result.keyTakeaways = fallback.keyTakeaways;
        result.followUps = fallback.followUps;
        result.topic = fallback.topic;
        result.practice = fallback.practice;
        result.generatedBy = fallback.generatedBy;
        result.safety = fallback.safety;
        result.notice = fallback.notice;
      } else {
        result.reply = aiResult.reply;
        result.keyTakeaways = aiResult.keyTakeaways;
        result.followUps = aiResult.followUps;
        result.topic = aiResult.topic;
        result.practice = aiResult.practice;
        result.generatedBy = aiResult.generatedBy;
        result.safety = aiResult.safety;
        result.notice = aiResult.notice;
      }
    }

    // Persist the turn so follow-up questions keep real context.
    let doc = await TutorConversation.findOne({ userId }).sort({ lastMessageAt: -1, createdAt: -1 });
    if (!doc) {
      doc = await TutorConversation.create({ userId });
    }
    doc.difficulty = difficulty;
    if (!doc.title || doc.title === 'New conversation') {
      doc.title = clean.slice(0, 80) || 'New conversation';
    }

    const userMessage = {
      role: 'user', text: clean, difficulty, safety: 'ok',
      topic: result.topic, keyTakeaways: [], followUps: [],
    };
    doc.messages.push(userMessage);

    const modelMessage = {
      role: 'model', text: result.reply.slice(0, 8000), difficulty,
      generatedBy: result.generatedBy, safety: result.safety,
      topic: result.topic,
      keyTakeaways: result.keyTakeaways.slice(0, 5),
      followUps: result.followUps.slice(0, 3),
    };
    doc.messages.push(modelMessage);

    if (doc.messages.length > MAX_STORED_MESSAGES + 2) {
      doc.messages = doc.messages.slice(-MAX_STORED_MESSAGES);
    }
    doc.lastMessageAt = new Date();
    await doc.save();

    const saved = await TutorConversation.findById(doc._id).lean();

    res.json({
      reply: result.reply,
      keyTakeaways: result.keyTakeaways,
      followUps: result.followUps,
      topic: result.topic,
      topicLabel: TOPIC_LABELS[result.topic] || 'Cybersecurity',
      practice: result.practice,
      generatedBy: result.generatedBy,
      safety: result.safety,
      notice: result.notice,
      difficulty,
      personalization: {
        hasHistory: context.hasHistory,
        attempts: context.attempts,
        answeredQuestions: context.answeredQuestions,
        currentDifficulty: context.currentDifficulty,
        recommendedLevel: context.recommendedLevel,
        averageScore: context.averageScore,
        lastScore: context.lastScore,
        weakTopics: context.weakTopics,
        strongTopics: context.strongTopics,
        roadmap: context.roadmap,
      },
      suggestedPrompts: context.suggestedPrompts,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------- 3. Learning path ----------------------- */

router.post('/learning-path', express.json({ limit: '50kb' }), async (req, res) => {
  try {
    const b = req.body || {};
    const score = Number(b.score);
    const total = Number(b.total);
    const correct = Number(b.correct);

    if (!Number.isFinite(score) || score < 0 || score > 100 || !Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: 'Complete a quiz first, then generate your learning path.' });
    }

    const performance = {
      score: Math.round(score),
      total: Math.min(Math.round(total), 100),
      correct: Math.max(0, Math.min(Math.round(correct), Math.round(total))),
      strongAreas: strArray(b.strongAreas, 8, 60),
      weakAreas: strArray(b.weakAreas, 8, 60),
      categoryStats: b.categoryStats && typeof b.categoryStats === 'object'
        ? Object.fromEntries(
            Object.entries(b.categoryStats).slice(0, 12).map(([key, val]) => [
              String(key).slice(0, 40),
              {
                correct: Math.max(0, Math.min(Number(val?.correct) || 0, 100)),
                total: Math.max(0, Math.min(Number(val?.total) || 0, 100)),
              },
            ])
          )
        : {},
    };

    res.json(await learningPath({ performance }));
  } catch (err) {
    sendError(res, err);
  }
});

/* ---------- 4. News explainer + ask-about-news ----------- */

router.post('/news-explain', express.json({ limit: '100kb' }), async (req, res) => {
  try {
    const b = req.body || {};
    const a = b.article || {};
    const article = {
      title: str(a.title, 300),
      excerpt: str(a.excerpt, 2500),
      category: str(a.category, 60),
      source: str(a.source, 120),
      date: str(a.date, 40),
      advice: str(a.advice, 1200),
      tags: strArray(a.tags, 8, 40),
    };

    if (!article.title && !article.excerpt) {
      return res.status(400).json({ error: 'No article information available to explain.' });
    }

    const question = str(b.question, 1000);
    if (question) {
      res.json(await askAboutNews({ article, question }));
    } else {
      res.json(await explainNews({ article }));
    }
  } catch (err) {
    sendError(res, err);
  }
});

export default router;

