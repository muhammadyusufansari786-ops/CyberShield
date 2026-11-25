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
export { ThreatItem, ThreatSyncState } from './ThreatIntel.js';
export {
  Question,
  QuizSession,
  QuestionHistory,
  AdminQuestionLog,
  QUESTION_TOPICS,
  QUESTION_DIFFICULTIES,
} from './quizBank.js';

/* ------------------------------------------------------------------ */
/* QuizAttempt - one finished quiz run of a user                       */
/* ------------------------------------------------------------------ */

const quizAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Client-generated id for ONE quiz run. The unique (userId, submissionId)
    // index below makes a repeated submit of the same run a no-op instead of
    // a duplicate record (double click, retry, resubmit after refresh).
    submissionId: { type: String, trim: true, maxlength: 64 },
    score: { type: Number, required: true, min: 0, max: 100 }, // percentage
    total: { type: Number, required: true, min: 1 }, // questions in the run
    correct: { type: Number, required: true, min: 0 },
    category: { type: String, trim: true, maxlength: 60 },
    durationSeconds: { type: Number, min: 0, max: 7200, default: null },

    // Adaptive quiz support. "normal" keeps the original behaviour for every
    // attempt saved before this feature existed.
    mode: { type: String, enum: ['normal', 'adaptive'], default: 'normal', index: true },
    startDifficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: null },
    finalDifficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: null },
    // Raw (unweighted) percentage, stored only when per-question data exists so
    // the weighted adaptive score can always be compared with plain accuracy.
    rawScore: { type: Number, min: 0, max: 100, default: null },
    // Per-question record used for topic/difficulty analysis. Never contains
    // the option text or the correct option index - just enough to score.
    questions: {
      type: [
        new Schema(
          {
            questionId: { type: String, trim: true, maxlength: 32, required: true },
            topic: { type: String, trim: true, maxlength: 40, required: true },
            difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
            correct: { type: Boolean, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true } // createdAt = completion date
);
quizAttemptSchema.index({ userId: 1, createdAt: -1 });
quizAttemptSchema.index({ userId: 1, mode: 1, createdAt: -1 });
quizAttemptSchema.index(
  { userId: 1, submissionId: 1 },
  { unique: true, partialFilterExpression: { submissionId: { $type: 'string' } } }
);

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

// One saved step of a generated learning path (Gemini output, validated
// server-side before it is stored - the dashboard renders stored data only).
const learningStepSchema = new Schema(
  {
    type: { type: String, trim: true, maxlength: 20 },
    title: { type: String, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 800 },
    link: { type: String, trim: true, maxlength: 40 },

    // Personalized roadmap fields (a legacy quiz-generated path leaves these
    // empty and keeps rendering exactly as before).
    lessonKey: { type: String, trim: true, maxlength: 120 },
    topic: { type: String, trim: true, maxlength: 40 },
    topicLabel: { type: String, trim: true, maxlength: 80 },
    stage: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: null },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: null },
    objective: { type: String, trim: true, maxlength: 400 },
    why: { type: String, trim: true, maxlength: 500 },
    estimatedMinutes: { type: Number, min: 5, max: 180, default: null },
    resource: { type: String, trim: true, maxlength: 40 },
    resourceLabel: { type: String, trim: true, maxlength: 120 },
    exercise: { type: String, trim: true, maxlength: 600 },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { _id: false }
);

const learningProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    score: { type: Number, min: 0, max: 100 },
    summary: { type: String, trim: true, maxlength: 1200 },
    strongAreas: { type: [String], default: [] },
    weakAreas: { type: [String], default: [] },
    focusArea: { type: String, trim: true, maxlength: 120 },
    // The quiz attempt this path was generated from (when available).
    sourceAttemptId: { type: Schema.Types.ObjectId, ref: 'QuizAttempt', default: null },
    steps: { type: [learningStepSchema], default: [] },
    generatedAt: { type: Date, default: Date.now },

    // "quiz-path" = the quick post-quiz path saved by the quiz page.
    // "roadmap"   = the full personalized roadmap managed on learning-path.html.
    kind: { type: String, enum: ['quiz-path', 'roadmap'], default: 'quiz-path', index: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    title: { type: String, trim: true, maxlength: 160 },
    level: { type: String, enum: ['easy', 'medium', 'hard'], default: null },
    generatedBy: { type: String, enum: ['gemini', 'rule-based'], default: 'gemini' },
    fallbackReason: { type: String, trim: true, maxlength: 300, default: null },
    // Measured performance this roadmap was built from (no personal data).
    profileSnapshot: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);
learningProgressSchema.index({ userId: 1, createdAt: -1 });
learningProgressSchema.index({ userId: 1, kind: 1, status: 1, createdAt: -1 });

export const LearningProgress = mongoose.model('LearningProgress', learningProgressSchema);

/* ------------------------------------------------------------------ */
/* TutorConversation - private AI tutor conversation of one user        */
/* ------------------------------------------------------------------ */

// Stored server-side so follow-up questions keep their context and a
// conversation can never be read by another account. The browser receives
// only its own session's conversation.
const tutorMessageSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'model'], required: true },
    text: { type: String, required: true, maxlength: 8000 },
    difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
    generatedBy: {
      type: String,
      enum: ['gemini', 'curated', 'safety-guard'],
      default: 'gemini',
    },
    safety: { type: String, enum: ['ok', 'redirected'], default: 'ok' },
    topic: { type: String, trim: true, maxlength: 40, default: 'general' },
    keyTakeaways: { type: [String], default: [] },
    followUps: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const tutorConversationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, trim: true, maxlength: 120, default: 'New conversation' },
    difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
    messages: { type: [tutorMessageSchema], default: [] },
    lastMessageAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);
tutorConversationSchema.index({ userId: 1, lastMessageAt: -1 });

export const TutorConversation = mongoose.model('TutorConversation', tutorConversationSchema);
