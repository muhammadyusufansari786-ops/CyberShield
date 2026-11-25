/**
 * CyberShield - server-side quiz flow
 *
 * The browser never receives the answer key. It asks for one question at a
 * time, submits one answer at a time, and the OFFICIAL score is computed here
 * when the run is submitted.
 *
 *   GET  /api/quiz/meta    - approved question counts (no answers)
 *   POST /api/quiz/start   - create a run (normal or adaptive)
 *   POST /api/quiz/next    - serve the next question
 *   POST /api/quiz/answer  - check one answer, update adaptive difficulty
 *   POST /api/quiz/submit  - official scoring + persistence (idempotent)
 *
 * Ownership: every session is bound to the server-side session user id (or is
 * anonymous). A quizId belonging to another account is rejected as 404.
 */

import { Router } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { Question, QuizAttempt, QuizSession } from '../models/index.js';
import { requireAuth, sameOriginGuard } from '../middleware/auth.js';
import { TOPICS, TOPIC_LABELS, DIFFICULTIES, buildProfile, scoreQuestions } from '../services/adaptive.js';
import {
  approvedQuestionCount,
  buildTopicPlan,
  clientQuestion,
  getSeenIds,
  pickAdaptiveQuestion,
  pickNormalQuestions,
  recordQuestionHistory,
  shuffleOptions,
  stepDifficulty,
} from '../services/question-bank.js';

const router = Router();

const quizLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many quiz requests. Please take a short break and try again.' },
});

const CATEGORY_SET = new Set(['all', 'passwords', 'phishing', 'malware', 'privacy', 'mobile', 'scam']);
const MAX_QUESTIONS = 20;

const bodyParser = express.json({ limit: '16kb' });

function cleanStr(value, max) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001F]/g, '').trim().slice(0, max) : '';
}

function strictInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n !== Math.round(n) || n < min || n > max) return null;
  return n;
}

/** Session ownership: authenticated users must match; anonymous uses its key. */
function ownsSession(session, req) {
  if (!session) return false;
  const sessionUserId = req.session?.user?.id || null;
  if (session.userId && String(session.userId) !== String(sessionUserId)) return false;
  return true;
}

async function loadSession(req, quizId) {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(quizId)) return null;
  const session = await QuizSession.findOne({ sessionKey: quizId });
  if (!session || !ownsSession(session, req)) return null;
  return session;
}

function topicLabel(topic) {
  return TOPIC_LABELS[topic] || topic;
}

/* ------------------------------------------------------------------ */
/* GET /api/quiz/meta - bank size + per-topic counts                    */
/* ------------------------------------------------------------------ */

router.get('/meta', async (req, res, next) => {
  try {
    const [total, byTopic] = await Promise.all([
      approvedQuestionCount(),
      Question.aggregate([
        { $match: { status: 'approved', retired: { $ne: true } } },
        { $group: { _id: '$topic', count: { $sum: 1 } } },
      ]),
    ]);
    const counts = Object.fromEntries(byTopic.map((row) => [row._id, row.count]));
    res.json({
      approved: total,
      topics: TOPICS.map((slug) => ({ slug, label: topicLabel(slug), count: counts[slug] || 0 })),
      difficulties: DIFFICULTIES,
      maxQuestions: MAX_QUESTIONS,
      categories: [...CATEGORY_SET],
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/quiz/start                                                */
/* ------------------------------------------------------------------ */

router.post('/start', sameOriginGuard, quizLimiter, bodyParser, async (req, res, next) => {
  try {
    const body = req.body || {};
    const mode = body.mode === 'adaptive' ? 'adaptive' : 'normal';
    const count = strictInt(body.count ?? 10, 1, MAX_QUESTIONS);
    if (count === null) return res.status(400).json({ error: `Choose between 1 and ${MAX_QUESTIONS} questions.` });

    const category = CATEGORY_SET.has(cleanStr(body.category, 20).toLowerCase())
      ? cleanStr(body.category, 20).toLowerCase()
      : 'all';

    const userId = req.session?.user?.id || null;
    const quizId = crypto.randomUUID();

    const totalApproved = await approvedQuestionCount();
    if (!totalApproved) {
      return res.status(503).json({ error: 'The question bank is empty. Please try again later.' });
    }

    let profile = null;
    if (userId && mode === 'adaptive') {
      const attempts = await QuizAttempt.find({ userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .select({ questions: 1, score: 1, mode: 1, finalDifficulty: 1 })
        .lean();
      profile = buildProfile(attempts, {});
    }

    const doc = {
      sessionKey: quizId,
      userId,
      mode,
      category,
      count,
      status: 'active',
      startDifficulty: mode === 'adaptive' ? profile?.currentDifficulty || 'easy' : null,
      currentDifficulty: mode === 'adaptive' ? profile?.currentDifficulty || 'easy' : null,
      weakTopics: profile?.weakTopics?.map((t) => t.topic) || [],
      strongTopics: profile?.strongTopics?.map((t) => t.topic) || [],
    };

    let rotated = false;
    if (mode === 'normal') {
      const { questions, rotated: didRotate } = await pickNormalQuestions({ userId, count, category });
      if (!questions.length) {
        return res.status(503).json({ error: 'No approved questions match this category yet.' });
      }
      doc.count = questions.length;
      doc.queue = questions.map((q) => q.questionId);
      rotated = didRotate;
    } else {
      doc.topicPlan = buildTopicPlan(count, profile?.weakTopics || [], profile?.strongTopics || []);
      doc.seenIds = userId ? await getSeenIds(userId) : [];
    }

    const session = await QuizSession.create(doc);

    res.status(201).json({
      quizId: session.sessionKey,
      mode,
      total: session.count,
      startDifficulty: session.startDifficulty,
      currentDifficulty: session.currentDifficulty,
      personalized: !!userId,
      rotated,
      availableQuestions: totalApproved,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/quiz/next - one question, answers stripped                */
/* ------------------------------------------------------------------ */

router.post('/next', sameOriginGuard, quizLimiter, bodyParser, async (req, res, next) => {
  try {
    const quizId = cleanStr(req.body?.quizId, 64);
    const session = await loadSession(req, quizId);
    if (!session) return res.status(404).json({ error: 'Quiz session not found. Start a new quiz.' });

    if (session.status !== 'active' || session.questions.length >= session.count) {
      return res.json({ done: true, total: session.count, answered: session.questions.length });
    }

    let doc = null;
    let isNew = true;

    if (session.mode === 'normal') {
      const nextId = session.queue[session.questions.length];
      if (!nextId) return res.json({ done: true, total: session.count, answered: session.questions.length });
      doc = await Question.findOne({ questionId: nextId, status: 'approved', retired: { $ne: true } }).lean();
    } else {
      const picked = await pickAdaptiveQuestion(session);
      if (!picked) return res.json({ done: true, total: session.count, answered: session.questions.length });
      doc = picked.doc;
      isNew = picked.isNew;
    }

    if (!doc) {
      return res.json({ done: true, total: session.count, answered: session.questions.length });
    }

    const { optionOrder, correctIndex } = shuffleOptions(doc);
    const entry = {
      questionId: doc.questionId,
      topic: doc.topic,
      subtopic: doc.subtopic || '',
      difficulty: doc.difficulty,
      category: doc.category || 'general',
      optionOrder,
      correctIndex,
      newToUser: isNew,
    };

    session.questions.push(entry);
    if (!session.askedIds.includes(doc.questionId)) session.askedIds.push(doc.questionId);
    await session.save();

    return res.json({
      done: false,
      index: session.questions.length,
      total: session.count,
      mode: session.mode,
      difficulty: session.currentDifficulty,
      question: clientQuestion(doc, { optionOrder, isNew }),
    });
  } catch (err) {
    if (err?.name === 'VersionError') {
      return res.status(409).json({ error: 'This quiz was updated in another tab. Reload the page.' });
    }
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/quiz/answer - check one answer (server-side key)          */
/* ------------------------------------------------------------------ */

router.post('/answer', sameOriginGuard, quizLimiter, bodyParser, async (req, res, next) => {
  try {
    const quizId = cleanStr(req.body?.quizId, 64);
    const questionId = cleanStr(req.body?.questionId, 40);
    const selectedIndex = strictInt(req.body?.selectedIndex, -1, 3);
    if (selectedIndex === null) return res.status(400).json({ error: 'Choose a valid answer.' });

    const session = await loadSession(req, quizId);
    if (!session) return res.status(404).json({ error: 'Quiz session not found. Start a new quiz.' });

    const entry = session.questions.find((q) => q.questionId === questionId);
    if (!entry) return res.status(400).json({ error: 'That question is not part of this quiz.' });

    // Idempotent: a retry returns the same verdict and never re-applies the
    // adaptive streak change.
    if (entry.answered) {
      const question = await Question.findOne({ questionId }).select({ explanation: 1 }).lean();
      return res.json({
        correct: entry.isCorrect === true,
        correctIndex: entry.correctIndex,
        explanation: question?.explanation || '',
        moved: 0,
        difficulty: session.currentDifficulty,
        alreadyAnswered: true,
      });
    }

    const isCorrect = selectedIndex === entry.correctIndex;
    entry.answered = true;
    entry.selectedIndex = selectedIndex;
    entry.isCorrect = isCorrect;
    entry.answeredAt = new Date();

    let moved = 0;
    if (session.mode === 'adaptive') {
      session.streak = isCorrect
        ? Math.max(1, session.streak + 1)
        : Math.min(-1, session.streak - 1);

      if (session.streak >= 2) {
        const next = stepDifficulty(session.currentDifficulty, 1);
        moved = next !== session.currentDifficulty ? 1 : 0;
        session.currentDifficulty = next;
        session.streak = 0;
      } else if (session.streak <= -2) {
        const next = stepDifficulty(session.currentDifficulty, -1);
        moved = next !== session.currentDifficulty ? -1 : 0;
        session.currentDifficulty = next;
        session.streak = 0;
      }
    }

    await session.save();

    const question = await Question.findOne({ questionId }).select({ explanation: 1 }).lean();
    return res.json({
      correct: isCorrect,
      correctIndex: entry.correctIndex,
      explanation: question?.explanation || '',
      moved,
      difficulty: session.currentDifficulty,
      answered: session.questions.filter((q) => q.answered).length,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/quiz/submit - official score + persistence                */
/* ------------------------------------------------------------------ */

router.post('/submit', sameOriginGuard, quizLimiter, bodyParser, async (req, res, next) => {
  try {
    const quizId = cleanStr(req.body?.quizId, 64);
    const session = await loadSession(req, quizId);
    if (!session) return res.status(404).json({ error: 'Quiz session not found. Start a new quiz.' });

    const durationSeconds = strictInt(req.body?.durationSeconds ?? 0, 0, 7200) ?? 0;

    // Repeated submit (double click, refresh) returns the stored attempt.
    if (session.status === 'completed') {
      const existing = session.userId
        ? await QuizAttempt.findOne({ userId: session.userId, submissionId: session.sessionKey }).lean()
        : null;
      if (existing) {
        return res.json({
          saved: true,
          duplicate: true,
          score: existing.score,
          rawScore: existing.rawScore ?? null,
          total: existing.total,
          correct: existing.correct,
          mode: existing.mode,
          startDifficulty: existing.startDifficulty,
          finalDifficulty: existing.finalDifficulty,
          summary: null,
        });
      }
      return res.status(409).json({ error: 'This quiz was already submitted.' });
    }

    const served = session.questions;
    if (!served.length) return res.status(400).json({ error: 'No questions were answered.' });

    const records = served.map((q) => ({
      questionId: q.questionId,
      topic: q.topic,
      difficulty: q.difficulty,
      correct: q.isCorrect === true,
    }));

    const computed = scoreQuestions(records);
    if (!computed) return res.status(400).json({ error: 'Quiz result could not be computed.' });

    const mode = session.mode;
    const score = mode === 'adaptive' ? computed.score : computed.rawScore;

    // Per-run breakdown for the results screen (labels only, no keys).
    const difficultyDistribution = { easy: { asked: 0, correct: 0 }, medium: { asked: 0, correct: 0 }, hard: { asked: 0, correct: 0 } };
    const topicMap = new Map();
    for (const q of served) {
      difficultyDistribution[q.difficulty].asked++;
      if (q.isCorrect) difficultyDistribution[q.difficulty].correct++;
      if (!topicMap.has(q.topic)) topicMap.set(q.topic, { topic: q.topic, label: topicLabel(q.topic), correct: 0, total: 0 });
      const row = topicMap.get(q.topic);
      row.total++;
      if (q.isCorrect) row.correct++;
    }
    const topicStats = [...topicMap.values()]
      .map((row) => ({ ...row, accuracy: row.total ? Math.round((row.correct / row.total) * 100) : 0 }))
      .sort((a, b) => a.accuracy - b.accuracy);

    const weakTopics = topicStats.filter((t) => t.accuracy < 60).map((t) => t.label).slice(0, 4);
    const strongTopics = topicStats.filter((t) => t.accuracy >= 80).map((t) => t.label).slice(0, 4);
    const recommendedTopics = (weakTopics.length
      ? weakTopics
      : topicStats.map((t) => t.label)
    ).slice(0, 3);

    const summary = {
      weightedScore: mode === 'adaptive' ? computed.score : computed.rawScore,
      rawScore: computed.rawScore,
      correct: computed.correct,
      total: computed.total,
      startDifficulty: session.startDifficulty,
      finalDifficulty: session.currentDifficulty,
      difficultyDistribution,
      topicStats,
      weakTopics,
      strongTopics,
      recommendedTopics,
    };

    let saved = false;
    let duplicate = false;

    if (session.userId) {
      try {
        await QuizAttempt.create({
          userId: session.userId,
          submissionId: session.sessionKey,
          score,
          rawScore: mode === 'adaptive' ? computed.rawScore : null,
          total: computed.total,
          correct: computed.correct,
          category: session.category,
          durationSeconds,
          mode,
          startDifficulty: session.startDifficulty,
          finalDifficulty: session.currentDifficulty,
          questions: records,
        });
        saved = true;
      } catch (err) {
        if (err?.code === 11000) {
          duplicate = true;
          saved = true;
        } else {
          throw err;
        }
      }

      await recordQuestionHistory(session.userId, served.map((q) => ({ questionId: q.questionId, correct: q.isCorrect === true })));
    }

    session.status = 'completed';
    session.completedAt = new Date();
    await session.save();

    return res.json({
      saved,
      duplicate,
      score,
      rawScore: mode === 'adaptive' ? computed.rawScore : null,
      total: computed.total,
      correct: computed.correct,
      mode,
      startDifficulty: session.startDifficulty,
      finalDifficulty: session.currentDifficulty,
      summary,
      review: served.map((q) => ({
        questionId: q.questionId,
        correctIndex: q.correctIndex,
        selectedIndex: q.selectedIndex,
        correct: q.isCorrect === true,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/quiz/history - this user's attempted question ids only     */
/* ------------------------------------------------------------------ */

router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const { QuestionHistory } = await import('../models/index.js');
    const userId = req.session.user.id;
    const [rows, total] = await Promise.all([
      QuestionHistory.find({ userId }).sort({ lastSeenAt: -1 }).limit(200).select({ questionId: 1, lastCorrect: 1, lastSeenAt: 1 }).lean(),
      QuestionHistory.countDocuments({ userId }),
    ]);
    res.json({ attempted: total, recent: rows.map((r) => ({ questionId: r.questionId, lastCorrect: r.lastCorrect, lastSeenAt: r.lastSeenAt })) });
  } catch (err) {
    next(err);
  }
});

export default router;
