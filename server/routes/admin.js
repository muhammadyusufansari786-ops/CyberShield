/**
 * CyberShield - administrator question-bank API
 *
 * Every route is protected by requireAdmin, which re-reads the role from
 * MongoDB on each request. Ordinary users receive 403; anonymous callers 401.
 * No admin endpoint is reachable without a server-side admin session, and the
 * public registration route can never create an admin account.
 *
 *   GET    /api/admin/stats
 *   GET    /api/admin/questions?status=&topic=&difficulty=&source=&q=&batchId=&page=&limit=
 *   GET    /api/admin/questions/:questionId
 *   POST   /api/admin/questions                 (manual add)
 *   PATCH  /api/admin/questions/:questionId     (edit)
 *   POST   /api/admin/questions/:questionId/approve
 *   POST   /api/admin/questions/:questionId/reject
 *   POST   /api/admin/questions/:questionId/retire
 *   POST   /api/admin/generate                  (Gemini batch -> pending)
 *   GET    /api/admin/logs
 */

import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { AdminQuestionLog, Question } from '../models/index.js';
import { requireAdmin, sameOriginGuard } from '../middleware/auth.js';
import {
  bankStats,
  findDuplicateText,
  insertQuestion,
  listQuestionBank,
  normalizeText,
  validateQuestionInput,
} from '../services/question-bank.js';
import { generateQuestionBatch } from '../services/question-generator.js';

const router = Router();

const bodyParser = express.json({ limit: '60kb' });

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 400,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many admin requests. Please wait a moment.' },
});

const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Generation limit reached for this hour.' },
});

router.use(adminLimiter, requireAdmin);

function clean(value, max) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001F]/g, '').trim().slice(0, max) : '';
}

function questionJson(q) {
  return {
    questionId: q.questionId,
    text: q.text,
    options: q.options,
    correct: q.correct,
    explanation: q.explanation,
    topic: q.topic,
    subtopic: q.subtopic,
    difficulty: q.difficulty,
    category: q.category,
    source: q.source,
    status: q.status,
    batchId: q.batchId,
    rejectionReason: q.rejectionReason,
    retired: !!q.retired,
    approvedBy: q.approvedBy,
    approvedAt: q.approvedAt,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

async function audit(req, action, questionId, extra = {}, batchId = null) {
  try {
    await AdminQuestionLog.create({
      adminId: req.admin.id,
      adminEmail: req.admin.email,
      action,
      questionId: questionId || null,
      batchId,
      details: extra,
    });
  } catch (err) {
    // Audit failure must never block the admin action itself.
    console.error('[admin] audit log failed:', err?.message || err);
  }
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

router.get('/stats', async (req, res, next) => {
  try {
    res.json({ stats: await bankStats() });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Listing (paginated, filtered)                                       */
/* ------------------------------------------------------------------ */

router.get('/questions', async (req, res, next) => {
  try {
    const result = await listQuestionBank({
      status: req.query.status,
      topic: req.query.topic,
      difficulty: req.query.difficulty,
      source: req.query.source,
      batchId: req.query.batchId,
      q: req.query.q,
      includeRetired: req.query.includeRetired,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json({ ...result, items: result.items.map(questionJson) });
  } catch (err) {
    next(err);
  }
});

router.get('/questions/:questionId', async (req, res, next) => {
  try {
    const q = await Question.findOne({ questionId: clean(req.params.questionId, 40) }).lean();
    if (!q) return res.status(404).json({ error: 'Question not found.' });
    res.json({ question: questionJson(q) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Manual add                                                          */
/* ------------------------------------------------------------------ */

router.post('/questions', sameOriginGuard, bodyParser, async (req, res, next) => {
  try {
    const status = req.body?.status === 'pending' ? 'pending' : 'approved';
    const questionId =
      clean(req.body?.questionId, 40) || `h-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

    const result = await insertQuestion(
      { ...req.body, questionId },
      { source: 'human', status, createdBy: req.admin.email }
    );

    if (!result.ok) {
      return res.status(400).json({ error: result.errors.join(' '), duplicateOf: result.duplicateOf || null });
    }
    await audit(req, status === 'approved' ? 'create-approved' : 'create-pending', questionId);
    res.status(201).json({ question: questionJson(result.question.toObject()) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Edit (validated, duplicate-checked)                                 */
/* ------------------------------------------------------------------ */

router.patch('/questions/:questionId', sameOriginGuard, bodyParser, async (req, res, next) => {
  try {
    const questionId = clean(req.params.questionId, 40);
    const existing = await Question.findOne({ questionId });
    if (!existing) return res.status(404).json({ error: 'Question not found.' });

    const merged = {
      questionId,
      text: req.body?.text ?? existing.text,
      options: req.body?.options ?? existing.options,
      correct: req.body?.correct ?? existing.correct,
      explanation: req.body?.explanation ?? existing.explanation,
      topic: req.body?.topic ?? existing.topic,
      subtopic: req.body?.subtopic ?? existing.subtopic,
      difficulty: req.body?.difficulty ?? existing.difficulty,
    };

    const { errors, value } = validateQuestionInput(merged, { requireId: true });
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const duplicate = await findDuplicateText(value.text, { excludeQuestionId: questionId, topic: value.topic });
    if (duplicate) {
      return res.status(409).json({
        error: 'Another question already asks this. Edit it to be distinct before saving.',
        duplicateOf: duplicate.question?.questionId || null,
      });
    }

    existing.text = value.text;
    existing.normalizedText = normalizeText(value.text);
    existing.options = value.options;
    existing.correct = value.correct;
    existing.explanation = value.explanation;
    existing.topic = value.topic;
    existing.subtopic = value.subtopic;
    existing.difficulty = value.difficulty;
    existing.category = value.category;
    await existing.save();

    await audit(req, 'edit', questionId, { status: existing.status }, existing.batchId);
    res.json({ question: questionJson(existing.toObject()) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Approve / reject / retire (atomic status transitions)               */
/* ------------------------------------------------------------------ */

router.post('/questions/:questionId/approve', sameOriginGuard, bodyParser, async (req, res, next) => {
  try {
    const questionId = clean(req.params.questionId, 40);
    const question = await Question.findOne({ questionId });
    if (!question) return res.status(404).json({ error: 'Question not found.' });
    if (question.status !== 'pending') {
      return res.status(409).json({ error: `Only pending questions can be approved (this one is ${question.status}).` });
    }

    // Re-validate before it can enter the active bank.
    const { errors, value } = validateQuestionInput(
      { ...question.toObject(), questionId },
      { requireId: true }
    );
    if (errors.length) return res.status(400).json({ error: `Cannot approve: ${errors.join(' ')}` });

    const duplicate = await findDuplicateText(value.text, { excludeQuestionId: questionId, topic: value.topic });
    if (duplicate) {
      return res.status(409).json({
        error: 'Cannot approve: an approved or pending question already covers this.',
        duplicateOf: duplicate.question?.questionId || null,
      });
    }

    // Atomic transition - two admins approving at once cannot both win.
    const updated = await Question.findOneAndUpdate(
      { questionId, status: 'pending' },
      {
        $set: {
          status: 'approved',
          retired: false,
          approvedBy: req.admin.email,
          approvedAt: new Date(),
          rejectionReason: null,
        },
      },
      { new: true }
    ).lean();

    if (!updated) return res.status(409).json({ error: 'This question was just reviewed by another admin.' });

    await audit(req, 'approve', questionId, null, updated.batchId);
    res.json({ question: questionJson(updated) });
  } catch (err) {
    next(err);
  }
});

router.post('/questions/:questionId/reject', sameOriginGuard, bodyParser, async (req, res, next) => {
  try {
    const questionId = clean(req.params.questionId, 40);
    const reason = clean(req.body?.reason, 300) || 'Rejected by administrator.';

    const updated = await Question.findOneAndUpdate(
      { questionId, status: 'pending' },
      { $set: { status: 'rejected', rejectionReason: reason } },
      { new: true }
    ).lean();

    if (!updated) {
      const exists = await Question.exists({ questionId });
      return res
        .status(exists ? 409 : 404)
        .json({ error: exists ? 'Only pending questions can be rejected.' : 'Question not found.' });
    }

    await audit(req, 'reject', questionId, { reason }, updated.batchId);
    res.json({ question: questionJson(updated) });
  } catch (err) {
    next(err);
  }
});

router.post('/questions/:questionId/retire', sameOriginGuard, bodyParser, async (req, res, next) => {
  try {
    const questionId = clean(req.params.questionId, 40);
    const updated = await Question.findOneAndUpdate(
      { questionId, status: 'approved' },
      { $set: { retired: true } },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ error: 'Approved question not found.' });

    await audit(req, 'retire', questionId, null, updated.batchId);
    res.json({ question: questionJson(updated) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Gemini batch generation -> pending queue                            */
/* ------------------------------------------------------------------ */

router.post('/generate', sameOriginGuard, generateLimiter, bodyParser, async (req, res, next) => {
  try {
    const result = await generateQuestionBatch({
      topic: clean(req.body?.topic, 40),
      difficulty: clean(req.body?.difficulty, 10),
      count: req.body?.count,
      adminEmail: req.admin.email,
    });

    await audit(req, 'generate', null, {
      requested: result.requested,
      accepted: result.accepted,
      rejected: result.rejected.length,
      errors: result.geminiError || null,
    }, result.batchId);

    if (result.geminiError && !result.accepted) {
      return res.status(503).json({
        error: 'Gemini could not generate questions right now. Nothing was added; try again later.',
        batchId: result.batchId,
        rejected: result.rejected.length,
      });
    }

    res.status(201).json({
      batchId: result.batchId,
      requested: result.requested,
      accepted: result.accepted,
      rejected: result.rejected,
      partial: !!result.geminiError,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

router.get('/logs', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const logs = await AdminQuestionLog.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({
      logs: logs.map((l) => ({
        id: String(l._id),
        action: l.action,
        questionId: l.questionId,
        batchId: l.batchId,
        adminEmail: l.adminEmail,
        createdAt: l.createdAt,
        details: l.details,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
