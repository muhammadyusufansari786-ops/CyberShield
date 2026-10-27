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
import {
  analyzeScam,
  tutorReply,
  learningPath,
  explainNews,
  askAboutNews,
  AiServiceError,
} from '../services/gemini.js';

const router = Router();

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

/** Trim and clamp a string, or return null when empty/invalid. */
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
  return /^[A-Za-z0-9+/=\r\n]+$/.test(base64.slice(0, 1024)) && /^[A-Za-z0-9+/=\s]*$/.test(base64);
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
  return res.status(503).json({
    error: 'AI service is temporarily unavailable. Please try again.',
  });
}

/* ------------------------------------------------------------------ */
/* 1. Scam analyzer                                                    */
/* ------------------------------------------------------------------ */

router.post(
  '/scam-analyze',
  express.json({ limit: '12mb' }), // room for base64 screenshots only on this route
  async (req, res) => {
    try {
      let { text, imageBase64, imageMime } = req.body || {};
      text = str(text, 6000);

      let image = null;
      if (imageBase64) {
        const cleaned = stripDataUrl(imageMime, imageBase64);
        if (!validImage(cleaned.mime, cleaned.base64)) {
          return res.status(400).json({ error: 'Unsupported or oversized image. Please upload a PNG, JPG or WebP screenshot under 10 MB.' });
        }
        image = { mimeType: cleaned.mime === 'image/jpg' ? 'image/jpeg' : cleaned.mime, data: cleaned.base64.replace(/\s/g, '') };
      }

      if (!text && !image) {
        return res.status(400).json({ error: 'Paste a suspicious message or attach a screenshot first.' });
      }

      res.json(await analyzeScam({ text, image }));
    } catch (err) {
      sendError(res, err);
    }
  }
);

/* ------------------------------------------------------------------ */
/* 2. AI tutor                                                         */
/* ------------------------------------------------------------------ */

const DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced']);

router.post('/tutor', express.json({ limit: '100kb' }), async (req, res) => {
  try {
    const message = str(req.body?.message, 4000);
    if (!message) {
      return res.status(400).json({ error: 'Type a question for the AI tutor first.' });
    }

    const difficulty = DIFFICULTIES.has(req.body?.difficulty) ? req.body.difficulty : 'beginner';

    const rawHistory = Array.isArray(req.body?.history) ? req.body.history.slice(-12) : [];
    const history = rawHistory
      .map((turn) => ({
        role: turn?.role === 'model' ? 'model' : 'user',
        text: str(turn?.text, 2000) || '',
      }))
      .filter((turn) => turn.text);

    res.json(await tutorReply({ message, difficulty, history }));
  } catch (err) {
    sendError(res, err);
  }
});

/* ------------------------------------------------------------------ */
/* 3. Learning path                                                    */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* 4. News explainer + ask-about-news                                  */
/* ------------------------------------------------------------------ */

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
