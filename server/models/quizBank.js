/**
 * CyberShield - question bank models
 *
 * Question          - one quiz question, from a human author or Gemini.
 *                     Only status:"approved" && retired:false is ever served.
 * QuizSession       - one in-progress run. Holds the served option order and
 *                     the correct index SERVER-SIDE, so the browser never sees
 *                     the answer key before it answers.
 * QuestionHistory   - per-user (userId, questionId) record used to avoid
 *                     repeating questions. Isolated by the compound index.
 * AdminQuestionLog  - audit trail for administrative question actions.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

export const QUESTION_TOPICS = [
  'phishing-social',
  'password-security',
  'malware-ransomware',
  'network-security',
  'identity-theft',
  'financial-fraud',
  'data-privacy',
  'safe-browsing',
  'emerging-threats',
];

export const QUESTION_DIFFICULTIES = ['easy', 'medium', 'hard'];
export const QUESTION_STATUSES = ['approved', 'pending', 'rejected'];

/* ------------------------------------------------------------------ */
/* Question                                                            */
/* ------------------------------------------------------------------ */

const questionSchema = new Schema(
  {
    // Public, stable id (q1, q1001, ai-<batch>-3). Unique across the bank.
    questionId: { type: String, required: true, unique: true, trim: true, maxlength: 40 },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    // Lowercased, punctuation/space-collapsed copy used for duplicate checks.
    normalizedText: { type: String, required: true, index: true, maxlength: 500 },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 4 && v.every((o) => typeof o === 'string' && o.trim()),
        message: 'A question must have exactly four non-empty options.',
      },
    },
    correct: { type: Number, required: true, min: 0, max: 3 },
    explanation: { type: String, required: true, trim: true, maxlength: 800 },
    topic: { type: String, required: true, enum: QUESTION_TOPICS, index: true },
    subtopic: { type: String, required: true, trim: true, maxlength: 60 },
    difficulty: { type: String, required: true, enum: QUESTION_DIFFICULTIES, index: true },
    // Legacy category kept so the normal quiz category filter is unchanged.
    category: { type: String, trim: true, maxlength: 40, default: 'general' },

    source: { type: String, enum: ['human', 'ai'], default: 'human', index: true },
    status: { type: String, enum: QUESTION_STATUSES, default: 'pending', index: true },
    batchId: { type: String, trim: true, maxlength: 80, default: null, index: true },
    rejectionReason: { type: String, trim: true, maxlength: 300, default: null },
    retired: { type: Boolean, default: false, index: true },
    createdBy: { type: String, trim: true, maxlength: 120, default: null },
    approvedBy: { type: String, trim: true, maxlength: 120, default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true } // createdAt / updatedAt
);

// The serving query: approved, not retired, filtered by topic/difficulty.
questionSchema.index({ status: 1, retired: 1, topic: 1, difficulty: 1 });
questionSchema.index({ status: 1, retired: 1, category: 1 });
questionSchema.index({ status: 1, createdAt: -1 });
questionSchema.index({ status: 1, source: 1 });
questionSchema.index({ batchId: 1, status: 1 });

export const Question = mongoose.model('Question', questionSchema);

/* ------------------------------------------------------------------ */
/* QuizSession                                                         */
/* ------------------------------------------------------------------ */

const sessionQuestionSchema = new Schema(
  {
    questionId: { type: String, required: true },
    topic: { type: String, required: true },
    subtopic: { type: String, default: '' },
    difficulty: { type: String, required: true },
    category: { type: String, default: 'general' },
    // Indices into the stored question options, in the order the user saw them.
    optionOrder: { type: [Number], required: true },
    // Correct answer position in the SERVED order. Never sent to the browser
    // before the user answers this question.
    correctIndex: { type: Number, required: true },
    answered: { type: Boolean, default: false },
    selectedIndex: { type: Number, default: null }, // -1 = timed out / skipped
    isCorrect: { type: Boolean, default: null },
    // "isNew" is reserved in Mongoose, so the session field is newToUser.
    newToUser: { type: Boolean, default: true },
    servedAt: { type: Date, default: Date.now },
    answeredAt: { type: Date, default: null },
  },
  { _id: false }
);

const quizSessionSchema = new Schema(
  {
    sessionKey: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    mode: { type: String, enum: ['normal', 'adaptive'], default: 'normal' },
    category: { type: String, default: 'all' },
    count: { type: Number, required: true, min: 1, max: 20 },
    status: { type: String, enum: ['active', 'completed'], default: 'active', index: true },

    // Adaptive state
    startDifficulty: { type: String, enum: QUESTION_DIFFICULTIES, default: null },
    currentDifficulty: { type: String, enum: QUESTION_DIFFICULTIES, default: null },
    streak: { type: Number, default: 0 },
    topicPlan: { type: [String], default: [] },
    weakTopics: { type: [String], default: [] },
    strongTopics: { type: [String], default: [] },
    seenIds: { type: [String], default: [] },
    rotated: { type: Boolean, default: false },

    // Preselected normal-run question ids (served one at a time).
    queue: { type: [String], default: [] },
    questions: { type: [sessionQuestionSchema], default: [] },
    askedIds: { type: [String], default: [] },

    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    // Mongo TTL: abandoned sessions disappear on their own.
    expiresAt: { type: Date, default: () => new Date(Date.now() + 6 * 60 * 60 * 1000) },
  },
  { timestamps: true }
);

quizSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
quizSessionSchema.index({ userId: 1, createdAt: -1 });

export const QuizSession = mongoose.model('QuizSession', quizSessionSchema);

/* ------------------------------------------------------------------ */
/* QuestionHistory - per-user attempted question ids                   */
/* ------------------------------------------------------------------ */

const questionHistorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    questionId: { type: String, required: true, trim: true, maxlength: 40 },
    timesSeen: { type: Number, default: 1, min: 1 },
    timesCorrect: { type: Number, default: 0, min: 0 },
    lastCorrect: { type: Boolean, default: null },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

questionHistorySchema.index({ userId: 1, questionId: 1 }, { unique: true });
questionHistorySchema.index({ userId: 1, lastSeenAt: 1 });

export const QuestionHistory = mongoose.model('QuestionHistory', questionHistorySchema);

/* ------------------------------------------------------------------ */
/* AdminQuestionLog - audit trail (never stores secrets)               */
/* ------------------------------------------------------------------ */

const adminQuestionLogSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    adminEmail: { type: String, trim: true, maxlength: 200, default: '' },
    action: { type: String, required: true, trim: true, maxlength: 40 },
    questionId: { type: String, trim: true, maxlength: 40, default: null },
    batchId: { type: String, trim: true, maxlength: 80, default: null },
    details: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

adminQuestionLogSchema.index({ createdAt: -1 });
adminQuestionLogSchema.index({ questionId: 1, createdAt: -1 });
adminQuestionLogSchema.index({ batchId: 1 });

export const AdminQuestionLog = mongoose.model('AdminQuestionLog', adminQuestionLogSchema);
