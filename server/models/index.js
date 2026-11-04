/**
 * CyberShield - Day-1 data models (prepared structure)
 *
 * These three models anchor future features. Day 1 only needs them to exist
 * with a userId link so every future record is per-account by construction
 * (multi-user data isolation). The dashboard shows empty states until these
 * features land, so the interfaces here are intentionally minimal.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

export { User } from './User.js';

/* ------------------------------------------------------------------ */
/* QuizAttempt - one finished quiz run of a user                       */
/* ------------------------------------------------------------------ */

const quizAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    total: { type: Number, required: true, min: 1 },
    correct: { type: Number, required: true, min: 0 },
    category: { type: String, trim: true, maxlength: 60 },
  },
  { timestamps: true }
);
quizAttemptSchema.index({ userId: 1, createdAt: -1 });

export const QuizAttempt = mongoose.model('QuizAttempt', quizAttemptSchema);

/* ------------------------------------------------------------------ */
/* ScamReport - text/screenshot scam analyses a user saves              */
/* ------------------------------------------------------------------ */

const scamReportSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    verdict: { type: String, trim: true, maxlength: 60 }, // e.g. "scam" / "suspicious" / "safe"
    excerpt: { type: String, trim: true, maxlength: 2000 }, // analyzed text snippet
  },
  { timestamps: true }
);
scamReportSchema.index({ userId: 1, createdAt: -1 });

export const ScamReport = mongoose.model('ScamReport', scamReportSchema);

/* ------------------------------------------------------------------ */
/* LearningProgress - aggregate learning-path stats of a user           */
/* ------------------------------------------------------------------ */

const learningProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    strongAreas: { type: [String], default: [] },
    weakAreas: { type: [String], default: [] },
    focusArea: { type: String, trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

export const LearningProgress = mongoose.model('LearningProgress', learningProgressSchema);
