/**
 * CyberShield - personalized learning roadmap API
 *
 *   GET   /api/learning/roadmap                  - active roadmap + measured profile
 *   POST  /api/learning/roadmap                  - generate/refresh (Gemini + fallback)
 *   PATCH /api/learning/roadmap/:id/lessons/:key - mark one lesson complete/incomplete
 *
 * All routes require authentication. Every database query is scoped by the
 * server-side session user id; no endpoint accepts a user id from the client.
 * Roadmaps are stored in the EXISTING LearningProgress collection with
 * kind:"roadmap", so quiz-generated paths and this feature never collide.
 */

import { Router } from 'express';
import express from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { LearningProgress, QuizAttempt } from '../models/index.js';
import { requireAuth, sameOriginGuard } from '../middleware/auth.js';
import { buildProfile, TOPICS, TOPIC_LABELS } from '../services/adaptive.js';
import {
  LESSON_KEY_RE,
  STAGE_ORDER,
  buildRuleBasedRoadmap,
  normalizeAiRoadmap,
} from '../services/learning-roadmap.js';
import { personalizedRoadmap } from '../services/gemini.js';

const router = Router();

const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many roadmap updates. Please try again later.' },
});

const bodyParser = express.json({ limit: '16kb' });

router.use(requireAuth);

const TOPIC_SET = new Set(TOPICS);

function attemptQuery(userId) {
  return QuizAttempt.find({ userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .select({ questions: 1, score: 1, mode: 1, finalDifficulty: 1, createdAt: 1 })
    .lean();
}

function profileSnapshot(profile, attemptsCount) {
  return {
    attempts: attemptsCount,
    answeredQuestions: profile.answeredQuestions,
    historySufficient: !!profile.historySufficient,
    currentDifficulty: profile.currentDifficulty || 'easy',
    averageScore: profile.averageScore ?? null,
    lastScore: profile.lastScore ?? null,
    weakTopics: (profile.weakTopics || []).map((t) => t.topic),
    strongTopics: (profile.strongTopics || []).map((t) => t.topic),
    topicPerformance: (profile.topicPerformance || []).map((row) => ({
      topic: row.topic,
      label: row.label,
      correct: row.correct,
      total: row.total,
      accuracy: row.accuracy,
    })),
  };
}

function publicProfile(profile, attemptsCount) {
  return {
    ...profileSnapshot(profile, attemptsCount),
    improvedTopics: (profile.improvedTopics || []).map((t) => ({ topic: t.topic, label: t.label, delta: t.delta })),
  };
}

function roadmapJson(doc) {
  const steps = (Array.isArray(doc.steps) ? doc.steps : []).map((step) => ({
    lessonKey: step.lessonKey,
    topic: step.topic,
    topicLabel: step.topicLabel || TOPIC_LABELS[step.topic] || step.topic,
    stage: step.stage || 'Beginner',
    difficulty: step.difficulty || 'easy',
    type: step.type || 'Learn',
    title: step.title,
    objective: step.objective || '',
    why: step.why || '',
    estimatedMinutes: step.estimatedMinutes || 20,
    description: step.description || '',
    resource: step.resource || 'resources',
    resourceLabel: step.resourceLabel || 'CyberShield',
    exercise: step.exercise || '',
    completed: step.completed === true,
    completedAt: step.completedAt || null,
    link: step.link || step.resource || 'resources',
  }));

  const total = steps.length;
  const completed = steps.filter((step) => step.completed).length;
  const nextLessonKey = steps.find((step) => !step.completed)?.lessonKey || null;

  const stages = STAGE_ORDER.map((stage) => {
    const list = steps.filter((step) => step.stage === stage);
    const done = list.filter((step) => step.completed).length;
    return {
      stage,
      total: list.length,
      completed: done,
      percent: list.length ? Math.round((done / list.length) * 100) : 0,
    };
  }).filter((stage) => stage.total > 0);

  return {
    id: String(doc._id),
    title: doc.title || 'Your cybersecurity roadmap',
    summary: doc.summary || '',
    level: doc.level || 'easy',
    generatedBy: doc.generatedBy === 'gemini' ? 'gemini' : 'rule-based',
    fallbackReason: doc.fallbackReason || null,
    generatedAt: doc.generatedAt || doc.createdAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    profileSnapshot: doc.profileSnapshot || null,
    steps,
    stages,
    progress: {
      total,
      completed,
      percent: total ? Math.round((completed / total) * 100) : 0,
      nextLessonKey,
      complete: total > 0 && completed === total,
    },
  };
}

/* ------------------------------------------------------------------ */
/* GET /api/learning/roadmap                                           */
/* ------------------------------------------------------------------ */

router.get('/roadmap', async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    const [roadmap, attempts, totalAttempts, adaptiveCount] = await Promise.all([
      LearningProgress.findOne({ userId, kind: 'roadmap', status: 'active' })
        .sort({ createdAt: -1 })
        .lean(),
      attemptQuery(userId),
      QuizAttempt.countDocuments({ userId }),
      QuizAttempt.countDocuments({ userId, mode: 'adaptive' }),
    ]);

    const profile = buildProfile(attempts, {
      adaptiveAttempts: adaptiveCount,
      normalAttempts: Math.max(0, totalAttempts - adaptiveCount),
    });

    res.json({
      roadmap: roadmap ? roadmapJson(roadmap) : null,
      profile: publicProfile(profile, totalAttempts),
      topics: TOPICS.map((slug) => ({ slug, label: TOPIC_LABELS[slug] })),
      hasAttempts: totalAttempts > 0,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/learning/roadmap - generate or refresh                    */
/* ------------------------------------------------------------------ */

router.post('/roadmap', sameOriginGuard, writeLimiter, bodyParser, async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    const [attempts, totalAttempts, adaptiveCount, previous] = await Promise.all([
      attemptQuery(userId),
      QuizAttempt.countDocuments({ userId }),
      QuizAttempt.countDocuments({ userId, mode: 'adaptive' }),
      LearningProgress.findOne({ userId, kind: 'roadmap', status: 'active' })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const profile = buildProfile(attempts, {
      adaptiveAttempts: adaptiveCount,
      normalAttempts: Math.max(0, totalAttempts - adaptiveCount),
    });

    // Preserve completions for lessons that keep the same stable key after a
    // refresh, so regenerating recommendations never silently loses progress.
    const carried = new Map(
      (previous?.steps || [])
        .filter((step) => step.completed && step.lessonKey)
        .map((step) => [step.lessonKey, step.completedAt || new Date()])
    );

    let generated = null;
    let generatedBy = 'rule-based';
    let fallbackReason = null;

    const keyReady = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_KEY_HERE';
    if (keyReady) {
      try {
        const aiData = await personalizedRoadmap({ profile, attempts: totalAttempts });
        generated = normalizeAiRoadmap(aiData, { profile, attemptsCount: totalAttempts });
        if (generated) {
          generatedBy = 'gemini';
        } else {
          fallbackReason = 'The AI roadmap was incomplete or inconsistent, so a rule-based plan built from your quiz results was used.';
        }
      } catch (err) {
        fallbackReason = 'Gemini is unavailable right now, so this roadmap was generated from your saved quiz results.';
        console.warn('[learning] roadmap generation fell back to the rule-based planner:', err?.message || err);
      }
    } else {
      fallbackReason = 'Gemini is not configured, so this roadmap was generated from your saved quiz results.';
    }

    if (!generated) generated = buildRuleBasedRoadmap({ profile, attemptsCount: totalAttempts });

    const steps = generated.lessons.map((lesson) => ({
      ...lesson,
      link: lesson.resource,
      completed: carried.has(lesson.lessonKey),
      completedAt: carried.get(lesson.lessonKey) || null,
    }));

    await LearningProgress.updateMany(
      { userId, kind: 'roadmap', status: 'active' },
      { $set: { status: 'archived' } }
    );

    const doc = await LearningProgress.create({
      userId,
      kind: 'roadmap',
      status: 'active',
      title: generated.title,
      summary: generated.summary,
      level: generated.level,
      score: profile.lastScore ?? null,
      generatedBy,
      fallbackReason,
      profileSnapshot: profileSnapshot(profile, totalAttempts),
      steps,
      generatedAt: new Date(),
    });

    res.status(201).json({
      roadmap: roadmapJson(doc),
      generatedBy,
      fallbackReason: generatedBy === 'gemini' ? null : fallbackReason,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* PATCH /api/learning/roadmap/:roadmapId/lessons/:lessonKey           */
/* ------------------------------------------------------------------ */

router.patch('/roadmap/:roadmapId/lessons/:lessonKey', sameOriginGuard, writeLimiter, bodyParser, async (req, res, next) => {
  try {
    const { roadmapId } = req.params;
    if (!mongoose.isValidObjectId(roadmapId)) {
      return res.status(404).json({ error: 'Roadmap not found.' });
    }

    let lessonKey = '';
    try {
      lessonKey = decodeURIComponent(req.params.lessonKey || '');
    } catch {
      lessonKey = '';
    }
    if (!LESSON_KEY_RE.test(lessonKey)) {
      return res.status(400).json({ error: 'Invalid lesson reference.' });
    }

    const completed = req.body?.completed;
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'Send { "completed": true | false }.' });
    }

    // Ownership is enforced in the query itself - a roadmap belonging to
    // another account is indistinguishable from a missing one.
    const doc = await LearningProgress.findOne({
      _id: roadmapId,
      userId: req.session.user.id,
      kind: 'roadmap',
    });
    if (!doc) return res.status(404).json({ error: 'Roadmap not found.' });

    const step = (doc.steps || []).find((item) => item.lessonKey === lessonKey);
    if (!step) return res.status(404).json({ error: 'Lesson not found in this roadmap.' });

    step.completed = completed;
    step.completedAt = completed ? new Date() : null;
    doc.markModified('steps');
    await doc.save();

    res.json({ roadmap: roadmapJson(doc) });
  } catch (err) {
    next(err);
  }
});

export default router;
