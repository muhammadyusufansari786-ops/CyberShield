/**
 * CyberShield - AI tutor conversation API
 *
 *   GET    /api/tutor/conversation  - signed-in user's active conversation,
 *                                     personalization and suggested prompts
 *   POST   /api/tutor/conversation  - clear and start a fresh conversation
 *   DELETE /api/tutor/conversation  - clear the conversation for good
 *
 * Chat itself stays on POST /api/ai/tutor (the existing tutor endpoint) so
 * there is no duplicate generation route. Every read/write is scoped by the
 * server-side session user id and no endpoint accepts a user id from the
 * client, so one account can never load another account's conversation.
 */

import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { TutorConversation } from '../models/index.js';
import { requireAuth, sameOriginGuard } from '../middleware/auth.js';
import {
  loadLearnerContext,
  publicPersonalization,
  serializeConversation,
} from '../services/tutor.js';

const router = Router();

const conversationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.session?.user?.id || ipKeyGenerator(req.ip),
  message: { error: 'Too many tutor requests. Please try again in a little while.' },
});

router.use(requireAuth);
router.use(conversationLimiter);

/* GET /api/tutor/conversation -------------------------------------- */

router.get('/conversation', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const [conversation, context] = await Promise.all([
      TutorConversation.findOne({ userId }).sort({ lastMessageAt: -1, createdAt: -1 }).lean(),
      loadLearnerContext(userId),
    ]);

    res.json({
      conversation: serializeConversation(conversation),
      personalization: publicPersonalization(context),
      suggestedPrompts: context.suggestedPrompts,
    });
  } catch (err) {
    next(err);
  }
});

/* POST /api/tutor/conversation - new conversation ------------------ */

router.post('/conversation', sameOriginGuard, async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    // Clearing replaces the stored conversation instead of archiving it, so
    // "clear" really removes the private chat from the database.
    await TutorConversation.deleteMany({ userId });
    const doc = await TutorConversation.create({ userId });

    const context = await loadLearnerContext(userId);
    res.status(201).json({
      conversation: serializeConversation(doc),
      personalization: publicPersonalization(context),
      suggestedPrompts: context.suggestedPrompts,
    });
  } catch (err) {
    next(err);
  }
});

/* DELETE /api/tutor/conversation ----------------------------------- */

router.delete('/conversation', sameOriginGuard, async (req, res, next) => {
  try {
    await TutorConversation.deleteMany({ userId: req.session.user.id });
    res.json({ ok: true, conversation: null });
  } catch (err) {
    next(err);
  }
});

export default router;
