/**
 * CyberShield - protected dashboard data
 *
 * GET /api/dashboard - returns ONLY the authenticated session user's profile
 * and feature statistics. The user identity always comes from the server-side
 * session, never from the request (no IDs accepted from the client). Feature
 * counts are real queries against the per-user collections, so they stay at
 * zero (clean empty states) until those Day-2+ features fill them.
 */

import { Router } from 'express';
import { User, QuizAttempt, ScamReport, LearningProgress } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id; // server-side identity only

    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });

    const [quizAttempts, bestDoc, scamAnalyses, learningPaths] = await Promise.all([
      QuizAttempt.countDocuments({ userId }),
      QuizAttempt.findOne({ userId }, { score: 1 }).sort({ score: -1, createdAt: -1 }).lean(),
      ScamReport.countDocuments({ userId }),
      LearningProgress.countDocuments({ userId }),
    ]);

    res.json({
      user: user.toSafeJSON(),
      stats: {
        quizAttempts,
        bestQuizScore: bestDoc?.score ?? null,
        scamAnalyses,
        learningPaths,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
