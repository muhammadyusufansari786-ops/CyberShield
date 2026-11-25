/**
 * CyberShield - protected dashboard + per-user progress
 *
 * GET  /api/dashboard        - profile + REAL per-user statistics, quiz history
 *                              and saved learning paths
 * POST /api/quiz-attempts    - save one finished quiz run (authenticated)
 * POST /api/learning-paths   - save a generated path (authenticated)
 *
 * Ownership rules:
 *  - The user id ALWAYS comes from the server-side session (req.session.user.id).
 *    No client-supplied user id is accepted anywhere in this file.
 *  - Every query is scoped by that id, so users can only ever read their own data.
 *  - Quiz submissions carry a client-generated submissionId; a unique
 *    (userId, submissionId) index turns repeated submissions of the same run
 *    into a single record instead of duplicates.
 *
 * Privacy: scam messages/screenshots are deliberately never stored (see the
 * Scam analyzer route). Consequences: ScamReport stays empty unless a future
 * opt-in feature writes it, and the dashboard explains that instead of faking
 * history.
 */

import express, { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { User, QuizAttempt, ScamReport, LearningProgress } from '../models/index.js';
import { requireAuth, sameOriginGuard } from '../middleware/auth.js';
import { TOPICS, TOPIC_LABELS, DIFFICULTIES, buildProfile, scoreQuestions } from '../services/adaptive.js';
import { approvedQuestionCount } from '../services/question-bank.js';

const router = Router();

/** Write endpoints are for real users, not scripts. */
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many updates in a short time. Please try again later.' },
});

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

const CATEGORIES = new Set(['all', 'passwords', 'phishing', 'malware', 'privacy', 'mobile', 'scam']);
const SUBMISSION_RE = /^[A-Za-z0-9-]{8,64}$/;
const PATH_LINKS = new Set(['home', 'password', 'quiz', 'news', 'threats', 'toolkit', 'glossary', 'resources', 'ai', 'about']);
const PATH_TYPES = new Set(['Learn', 'Read', 'Practice', 'Take']);
const TOPIC_SET = new Set(TOPICS);
const DIFFICULTY_SET = new Set(DIFFICULTIES);
const QUESTION_ID_RE = /^[A-Za-z0-9-]{1,32}$/;
const MAX_QUESTIONS_PER_ATTEMPT = 30;

function clampedInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(Math.round(n), min), max);
}

/**
 * Integer inside [min, max], or null when missing/out of range.
 * Scores are NEVER silently clamped - a malformed result is rejected so the
 * dashboard can only ever contain numbers the quiz actually produced.
 */
function strictInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n !== Math.round(n) || n < min || n > max) return null;
  return n;
}

function cleanStr(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function cleanList(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxLen));
}

function attemptJson(a) {
  return {
    id: String(a._id),
    score: a.score,
    rawScore: a.rawScore ?? null,
    total: a.total,
    correct: a.correct,
    category: a.category || 'all',
    mode: a.mode === 'adaptive' ? 'adaptive' : 'normal',
    startDifficulty: a.startDifficulty ?? null,
    finalDifficulty: a.finalDifficulty ?? null,
    durationSeconds: a.durationSeconds ?? null,
    completedAt: a.createdAt,
  };
}

/**
 * Validate the per-question records sent by the quiz page. Only ids, topics,
 * difficulties and a boolean are accepted - no option text or answer keys are
 * stored, so a leaked database row cannot be used to cheat a future quiz.
 */
function normalizeQuestions(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_QUESTIONS_PER_ATTEMPT) return null;
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const id = typeof item.id === 'string' ? item.id.trim() : typeof item.questionId === 'string' ? item.questionId.trim() : '';
    if (!QUESTION_ID_RE.test(id)) return null;
    const topic = typeof item.topic === 'string' ? item.topic.trim() : '';
    if (!TOPIC_SET.has(topic)) return null;
    const difficulty = typeof item.difficulty === 'string' ? item.difficulty.trim() : '';
    if (!DIFFICULTY_SET.has(difficulty)) return null;
    if (typeof item.correct !== 'boolean') return null;
    out.push({ questionId: id, topic, difficulty, correct: item.correct });
  }
  return out;
}

function difficultyOrNull(value) {
  return typeof value === 'string' && DIFFICULTY_SET.has(value) ? value : null;
}

function pathJson(p) {
  return {
    id: String(p._id),
    score: p.score ?? null,
    summary: p.summary || '',
    focusArea: p.focusArea || '',
    strongAreas: Array.isArray(p.strongAreas) ? p.strongAreas : [],
    weakAreas: Array.isArray(p.weakAreas) ? p.weakAreas : [],
    steps: (Array.isArray(p.steps) ? p.steps : []).map((s) => ({
      type: s.type,
      title: s.title,
      description: s.description,
      link: s.link,
    })),
    createdAt: p.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* GET /api/dashboard - real, session-scoped data                      */
/* ------------------------------------------------------------------ */

router.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id; // server-side identity only

    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [quizCount, avgAgg, latestDoc, bestDoc, scamAnalyses, learningPaths, attempts, paths, adaptiveCount, approvedQuestions] =
      await Promise.all([
        QuizAttempt.countDocuments({ userId }),
        QuizAttempt.aggregate([
          { $match: { userId: userObjectId } },
          { $group: { _id: null, avg: { $avg: '$score' } } },
        ]),
        QuizAttempt.findOne({ userId }).sort({ createdAt: -1 }).lean(),
        QuizAttempt.findOne({ userId }).sort({ score: -1, createdAt: -1 }).lean(),
        ScamReport.countDocuments({ userId }),
        LearningProgress.countDocuments({ userId }),
        QuizAttempt.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
        // Stored paths only - nothing is generated on page load.
        LearningProgress.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
        // Adaptive runs are a subset of all attempts; the difference is "normal".
        QuizAttempt.countDocuments({ userId, mode: 'adaptive' }),
        // Real approved-and-active questions only (never pending/rejected).
        approvedQuestionCount(),
      ]);

    const averageQuizScore =
      avgAgg[0] && Number.isFinite(avgAgg[0].avg) ? Math.round(avgAgg[0].avg) : null;

    const profile = buildProfile(attempts, {
      adaptiveAttempts: adaptiveCount,
      normalAttempts: Math.max(0, quizCount - adaptiveCount),
    });

    res.json({
      user: user.toSafeJSON(),
      stats: {
        quizAttempts: quizCount,
        bestQuizScore: bestDoc?.score ?? null,
        latestQuizScore: latestDoc?.score ?? null,
        averageQuizScore,
        scamAnalyses,
        learningPaths,
        // Adaptive quiz statistics (computed from saved attempts only).
        normalQuizAttempts: profile.normalAttempts,
        adaptiveQuizAttempts: profile.adaptiveAttempts,
        currentDifficulty: profile.currentDifficulty,
        historySufficient: profile.historySufficient,
        topicPerformance: profile.topicPerformance,
        weakTopics: profile.weakTopics.map((t) => t.label),
        strongTopics: profile.strongTopics.map((t) => t.label),
        improvedTopics: profile.improvedTopics,
        // Size of the active bank, read from MongoDB on every dashboard load.
        approvedQuestions,
      },
      quizAttempts: attempts.map(attemptJson),
      learningPaths: paths.map(pathJson),
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/adaptive/profile - this user's adaptive starting point      */
/* ------------------------------------------------------------------ */

router.get('/adaptive/profile', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const [attempts, total, adaptiveCount] = await Promise.all([
      QuizAttempt.find({ userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .select({ questions: 1, score: 1, mode: 1, finalDifficulty: 1, createdAt: 1 })
        .lean(),
      QuizAttempt.countDocuments({ userId }),
      QuizAttempt.countDocuments({ userId, mode: 'adaptive' }),
    ]);

    const profile = buildProfile(attempts, {
      adaptiveAttempts: adaptiveCount,
      normalAttempts: Math.max(0, total - adaptiveCount),
    });

    res.json({
      profile,
      topics: TOPICS.map((slug) => ({ slug, label: TOPIC_LABELS[slug] })),
      difficulties: DIFFICULTIES,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/quiz-attempts - save one finished run (idempotent)        */
/* ------------------------------------------------------------------ */

router.post(
  '/quiz-attempts',
  writeLimiter,
  sameOriginGuard,
  requireAuth,
  express.json({ limit: '20kb' }), // this app parses JSON per route, not globally
  async (req, res, next) => {
  try {
    const body = req.body || {};

    const submissionId = typeof body.submissionId === 'string' ? body.submissionId.trim() : '';
    if (!SUBMISSION_RE.test(submissionId)) {
      return res.status(400).json({ error: 'Invalid quiz submission id.' });
    }

    const total = strictInt(body.total, 1, 100);
    const correct = strictInt(body.correct, 0, 100);
    if (total === null || correct === null || correct > total) {
      return res.status(400).json({ error: 'Quiz result data is invalid.' });
    }

    const mode = body.mode === 'adaptive' ? 'adaptive' : 'normal';
    const questions = body.questions === undefined ? null : normalizeQuestions(body.questions);
    if (questions === null && body.questions !== undefined) {
      return res.status(400).json({ error: 'Quiz question data is invalid.' });
    }
    if (mode === 'adaptive' && !questions) {
      return res.status(400).json({ error: 'An adaptive quiz must include its question breakdown.' });
    }

    // With per-question data the score is RECOMPUTED here, so the stored
    // percentage always matches the answers the run actually recorded (adaptive
    // scoring weights harder questions more). Without it, the original client
    // score is used exactly as before.
    let score = strictInt(body.score, 0, 100);
    let rawScore = null;
    if (questions) {
      const computed = scoreQuestions(questions);
      if (!computed || computed.total !== total || computed.correct !== correct) {
        return res.status(400).json({ error: 'Quiz result does not match its question breakdown.' });
      }
      // Adaptive runs keep the difficulty-weighted score; normal runs keep the
      // plain percentage they have always shown on the dashboard.
      if (mode === 'adaptive') {
        score = computed.score;
        rawScore = computed.rawScore;
      } else {
        score = computed.rawScore;
        rawScore = null;
      }
    }
    if (score === null) {
      return res.status(400).json({ error: 'Quiz result data is invalid.' });
    }

    const startDifficulty = difficultyOrNull(body.startDifficulty);
    const finalDifficulty = difficultyOrNull(body.finalDifficulty);
    if (mode === 'adaptive' && (!startDifficulty || !finalDifficulty)) {
      return res.status(400).json({ error: 'Adaptive quizzes must report their difficulty levels.' });
    }

    const category = CATEGORIES.has(String(body.category || '').toLowerCase())
      ? String(body.category).toLowerCase()
      : 'all';
    const durationSeconds = clampedInt(body.durationSeconds ?? 0, 0, 7200) ?? 0;

    const userId = req.session.user.id;

    // Fast path: the same run was already stored (double click / retry).
    const existing = await QuizAttempt.findOne({ userId, submissionId }).lean();
    if (existing) {
      return res.status(200).json({ saved: true, duplicate: true, attempt: attemptJson(existing) });
    }

    try {
      const doc = await QuizAttempt.create({
        userId,
        submissionId,
        score,
        rawScore,
        total,
        correct,
        category,
        durationSeconds,
        mode,
        startDifficulty,
        finalDifficulty,
        questions: questions || [],
      });
      return res.status(201).json({ saved: true, duplicate: false, attempt: attemptJson(doc.toObject()) });
    } catch (err) {
      // Race between two requests with the same submission id: the unique
      // index rejects the second write, and we return the stored document.
      if (err?.code === 11000) {
        const dup = await QuizAttempt.findOne({ userId, submissionId }).lean();
        return res
          .status(200)
          .json({ saved: true, duplicate: true, attempt: dup ? attemptJson(dup) : null });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/learning-paths - save a Gemini-generated path            */
/* ------------------------------------------------------------------ */

/**
 * Called by the quiz page ONLY after /api/ai/learning-path succeeded. The
 * server validates the shape again before storing; if generation fails, the
 * browser never reaches this endpoint, so the dashboard can never display a
 * path that was not actually produced.
 */
router.post(
  '/learning-paths',
  writeLimiter,
  sameOriginGuard,
  requireAuth,
  express.json({ limit: '100kb' }),
  async (req, res, next) => {
  try {
    const body = req.body || {};

    const rawSteps = Array.isArray(body.steps) ? body.steps.slice(0, 8) : [];
    const steps = rawSteps
      .map((s) => ({
        type: PATH_TYPES.has(s?.type) ? s.type : 'Learn',
        title: cleanStr(s?.title, 200),
        description: cleanStr(s?.description, 800),
        link: PATH_LINKS.has(s?.link) ? s.link : 'quiz',
      }))
      .filter((s) => s.title);

    if (!steps.length) {
      return res.status(400).json({ error: 'No learning path steps to save.' });
    }

    const score = strictInt(body.score, 0, 100);
    if (score === null) {
      return res.status(400).json({ error: 'Learning path data is invalid.' });
    }

    const userId = req.session.user.id;
    const submissionId = typeof body.submissionId === 'string' ? body.submissionId.trim() : '';

    let sourceAttemptId = null;
    if (SUBMISSION_RE.test(submissionId)) {
      const attempt = await QuizAttempt.findOne({ userId, submissionId }, { _id: 1 }).lean();
      sourceAttemptId = attempt?._id ?? null;
    }

    const doc = await LearningProgress.create({
      userId,
      score,
      summary: cleanStr(body.summary, 1200),
      focusArea: cleanStr(body.focusArea, 120),
      strongAreas: cleanList(body.strongAreas, 8, 60),
      weakAreas: cleanList(body.weakAreas, 8, 60),
      sourceAttemptId,
      steps,
      generatedAt: new Date(),
    });

    return res.status(201).json({ saved: true, path: pathJson(doc.toObject()) });
  } catch (err) {
    next(err);
  }
});

export default router;
