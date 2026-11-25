/**
 * CyberShield - question bank service
 *
 * Single source of truth for:
 *   - validation + duplicate detection (human and AI questions)
 *   - boot-time seeding of the human-authored bank (idempotent)
 *   - efficient, random, per-user question selection (normal + adaptive)
 *   - bank statistics for the admin dashboard and the student dashboard
 *
 * Only documents with status:"approved" and retired != true are ever served.
 * Questions are read with small aggregation queries ($sample) rather than
 * loading the whole collection into the browser or memory.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Question, QuestionHistory } from '../models/quizBank.js';
import { TOPICS, TOPIC_LABELS, DIFFICULTIES } from './adaptive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/** Every requested subject, mapped to one of the nine adaptive topics. */
export const SUBTOPIC_LABELS = [
  'Phishing and Social Engineering',
  'Smishing and Vishing',
  'Password Security',
  'Malware and Ransomware',
  'Network Security',
  'Identity Theft',
  'Financial Fraud',
  'Data Privacy',
  'Safe Browsing',
  'Email Security',
  'Web Application Security',
  'Cloud Security',
  'Mobile Security',
  'Wi-Fi Security',
  'Cryptography Basics',
  'Authentication and Access Control',
  'Cyber Laws and Cybercrime Awareness',
  'Emerging Cyber Threats',
  'Artificial Intelligence Security',
  'Digital Forensics and Incident Response',
];

/** Legacy category used by the normal-quiz category filter. */
export const CATEGORY_BY_TOPIC = {
  'phishing-social': 'phishing',
  'password-security': 'passwords',
  'malware-ransomware': 'malware',
  'network-security': 'privacy',
  'identity-theft': 'privacy',
  'financial-fraud': 'scam',
  'data-privacy': 'privacy',
  'safe-browsing': 'mobile',
  'emerging-threats': 'scam',
};

const DEFAULT_SUBTOPIC = {
  'phishing-social': 'Phishing and Social Engineering',
  'password-security': 'Password Security',
  'malware-ransomware': 'Malware and Ransomware',
  'network-security': 'Network Security',
  'identity-theft': 'Identity Theft',
  'financial-fraud': 'Financial Fraud',
  'data-privacy': 'Data Privacy',
  'safe-browsing': 'Safe Browsing',
  'emerging-threats': 'Emerging Cyber Threats',
};

export const TOPIC_LABEL_SET = TOPIC_LABELS;
export const TOPIC_SET = new Set(TOPICS);
export const DIFFICULTY_SET = new Set(DIFFICULTIES);

/* ------------------------------------------------------------------ */
/* Normalisation / validation                                          */
/* ------------------------------------------------------------------ */

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(normalized) {
  return new Set(normalized.split(' ').filter((t) => t.length > 2));
}

/** Jaccard similarity of two normalised question texts (0..1). */
export function textSimilarity(a, b) {
  const A = tokenSet(normalizeText(a));
  const B = tokenSet(normalizeText(b));
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const t of A) if (B.has(t)) intersection++;
  return intersection / (A.size + B.size - intersection);
}

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, '').trim().slice(0, max);
}

/**
 * Structural + content validation. Returns cleaned values and a list of
 * human-readable problems. Technical accuracy cannot be proven structurally,
 * so AI questions additionally stay "pending" until an admin approves them.
 */
export function validateQuestionInput(input, { requireId = false } = {}) {
  const errors = [];
  const raw = input && typeof input === 'object' ? input : {};

  const text = clean(raw.text ?? raw.question, 500);
  if (text.length < 15) errors.push('Question text must be at least 15 characters.');
  if (text.length > 400) errors.push('Question text must be at most 400 characters.');

  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options = rawOptions.map((o) => clean(o, 200));
  if (options.length !== 4) errors.push('Exactly four answer options are required.');
  if (options.some((o) => !o)) errors.push('Every answer option must be non-empty.');
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    errors.push('Answer options must be distinct.');
  }

  const correct = Number(raw.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) {
    errors.push('Correct answer must be option 0-3.');
  }

  const explanation = clean(raw.explanation, 800);
  if (explanation.length < 20) errors.push('Explanation must be at least 20 characters.');
  if (explanation.length > 600) errors.push('Explanation must be at most 600 characters.');

  const topic = clean(raw.topic, 40);
  if (!TOPIC_SET.has(topic)) errors.push('Invalid topic.');

  const difficulty = clean(raw.difficulty, 10).toLowerCase();
  if (!DIFFICULTY_SET.has(difficulty)) errors.push('Invalid difficulty.');

  const subtopic = clean(raw.subtopic, 60) || DEFAULT_SUBTOPIC[topic] || '';
  if (subtopic.length < 2) errors.push('Subtopic is required.');

  const category = CATEGORY_BY_TOPIC[topic] || 'general';
  const questionIdRaw = clean(raw.questionId ?? raw.id, 40);
  if (requireId && !/^[A-Za-z0-9-]{2,40}$/.test(questionIdRaw)) {
    errors.push('Invalid question id.');
  }

  return {
    errors,
    value: {
      questionId: questionIdRaw || null,
      text,
      normalizedText: normalizeText(text),
      options,
      correct,
      explanation,
      topic,
      subtopic,
      difficulty,
      category,
    },
  };
}

/** True when an identical or near-identical question already exists. */
export async function findDuplicateText(text, { excludeQuestionId = null, topic = null } = {}) {
  const normalized = normalizeText(text);
  const filter = { status: { $in: ['approved', 'pending'] } };
  if (excludeQuestionId) filter.questionId = { $ne: excludeQuestionId };

  const exact = await Question.findOne({ ...filter, normalizedText: normalized })
    .select({ questionId: 1, text: 1 })
    .lean();
  if (exact) return { type: 'exact', question: exact };

  // Near-duplicate scan is limited to the same topic (few hundred rows at most)
  // and only runs for admin/generation writes, never for quiz serving.
  if (topic) {
    const candidates = await Question.find({ ...filter, topic })
      .select({ questionId: 1, text: 1 })
      .limit(600)
      .lean();
    for (const candidate of candidates) {
      if (textSimilarity(text, candidate.text) >= 0.82) {
        return { type: 'near', question: candidate };
      }
    }
  }
  return null;
}

/**
 * Insert a validated question. Dedupe runs first; the unique questionId index
 * is the final guard against races.
 */
export async function insertQuestion(input, { source = 'human', status = 'pending', batchId = null, createdBy = null } = {}) {
  const { errors, value } = validateQuestionInput(input, { requireId: true });
  if (errors.length) return { ok: false, errors };

  const duplicate = await findDuplicateText(value.text, {
    excludeQuestionId: value.questionId,
    topic: value.topic,
  });
  if (duplicate) {
    return {
      ok: false,
      errors: ['This question is a duplicate of an existing question.'],
      duplicateOf: duplicate.question?.questionId || null,
    };
  }

  try {
    const doc = await Question.create({
      ...value,
      source,
      status,
      batchId,
      createdBy,
      approvedBy: status === 'approved' ? createdBy : null,
      approvedAt: status === 'approved' ? new Date() : null,
    });
    return { ok: true, question: doc };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, errors: ['A question with this id already exists.'], duplicateOf: value.questionId };
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Seeding                                                             */
/* ------------------------------------------------------------------ */

/** Human bank files, in load order. Missing files are skipped. */
const HUMAN_BANK_FILES = [
  'data/quiz-questions.json',
  'data/questions/human-extra.json',
  'data/questions/human-extra-2.json',
  'data/questions/human-extra-3.json',
];

function loadJsonBank(relativePath) {
  const full = path.join(PROJECT_ROOT, relativePath);
  if (!fs.existsSync(full)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(full, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`[question-bank] could not parse ${relativePath}:`, err.message);
    return [];
  }
}

/**
 * Import the human-authored bank once per server boot. Existing questionIds
 * are left untouched (admin edits/retirements are never overwritten), so this
 * is safe to run on every start.
 */
export async function seedQuestionBank() {
  const seen = new Set();
  const inserts = [];
  let skippedExisting = 0;
  let invalid = 0;

  for (const file of HUMAN_BANK_FILES) {
    for (const raw of loadJsonBank(file)) {
      const id = clean(raw?.id ?? raw?.questionId, 40);
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const { errors, value } = validateQuestionInput({ ...raw, questionId: id }, { requireId: true });
      if (errors.length) {
        invalid++;
        continue;
      }
      inserts.push(value);
    }
  }

  if (!inserts.length) return { inserted: 0, skippedExisting, invalid };

  const ids = inserts.map((q) => q.questionId);
  const existing = new Set(
    (await Question.find({ questionId: { $in: ids } }).select({ questionId: 1 }).lean()).map(
      (d) => d.questionId
    )
  );
  skippedExisting = ids.filter((id) => existing.has(id)).length;

  const docs = inserts
    .filter((q) => !existing.has(q.questionId))
    .map((q, i) => ({
      ...q,
      source: 'human',
      status: 'approved',
      createdBy: 'seed:human-bank',
      approvedBy: 'seed:human-bank',
      approvedAt: new Date(),
    }));

  let inserted = 0;
  if (docs.length) {
    try {
      const result = await Question.insertMany(docs, { ordered: false });
      inserted = result.length;
    } catch (err) {
      inserted = err?.result?.insertedCount ?? docs.length - (err?.writeErrors?.length || 0);
      if (err?.code !== 11000 && !err?.writeErrors) throw err;
    }
  }

  return { inserted, skippedExisting, invalid };
}

/* ------------------------------------------------------------------ */
/* Stats / admin listing                                               */
/* ------------------------------------------------------------------ */

export async function bankStats() {
  const [byStatus, byTopic, byDifficulty, bySource, retired, batches] = await Promise.all([
    Question.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Question.aggregate([
      { $match: { status: 'approved', retired: { $ne: true } } },
      { $group: { _id: { topic: '$topic', difficulty: '$difficulty' }, count: { $sum: 1 } } },
    ]),
    Question.aggregate([
      { $match: { status: 'approved', retired: { $ne: true } } },
      { $group: { _id: '$difficulty', count: { $sum: 1 } } },
    ]),
    Question.aggregate([{ $group: { _id: { source: '$source', status: '$status' }, count: { $sum: 1 } } }]),
    Question.countDocuments({ status: 'approved', retired: true }),
    Question.aggregate([
      { $match: { source: 'ai', batchId: { $ne: null } } },
      { $group: { _id: '$batchId', total: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 20 },
    ]),
  ]);

  const status = { approved: 0, pending: 0, rejected: 0 };
  for (const row of byStatus) status[row._id] = row.count;

  const topicCounts = {};
  for (const topic of TOPICS) topicCounts[topic] = { total: 0, easy: 0, medium: 0, hard: 0, label: TOPIC_LABELS[topic] };
  for (const row of byTopic) {
    const topic = row._id.topic;
    const difficulty = row._id.difficulty;
    if (!topicCounts[topic]) continue;
    topicCounts[topic].total += row.count;
    if (difficulty in topicCounts[topic]) topicCounts[topic][difficulty] += row.count;
  }

  const difficulty = { easy: 0, medium: 0, hard: 0 };
  for (const row of byDifficulty) difficulty[row._id] = row.count;

  const source = { human: 0, ai: 0 };
  for (const row of bySource) {
    const key = row._id.source === 'ai' ? 'ai' : 'human';
    source[key] += row.count;
  }

  return {
    total: status.approved + status.pending + status.rejected,
    status,
    approved: status.approved,
    pending: status.pending,
    rejected: status.rejected,
    retiredApproved: retired,
    available: Math.max(0, status.approved - retired),
    topicCounts,
    difficulty,
    source,
    batches: batches.map((b) => ({ batchId: b._id, total: b.total })),
  };
}

export async function listQuestionBank(filters = {}) {
  const page = Math.min(Math.max(Number(filters.page) || 1, 1), 10_000);
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 50);
  const query = {};

  if (filters.status && ['approved', 'pending', 'rejected'].includes(filters.status)) query.status = filters.status;
  if (filters.topic && TOPIC_SET.has(filters.topic)) query.topic = filters.topic;
  if (filters.difficulty && DIFFICULTY_SET.has(filters.difficulty)) query.difficulty = filters.difficulty;
  if (filters.source && ['human', 'ai'].includes(filters.source)) query.source = filters.source;
  if (filters.batchId) query.batchId = clean(filters.batchId, 80);
  if (filters.includeRetired === 'true') {
    /* no retired filter */
  } else if (filters.status === 'approved') {
    query.retired = { $ne: true };
  }

  const search = clean(filters.q, 120);
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ questionId: regex }, { text: regex }, { explanation: regex }, { subtopic: regex }];
  }

  const [items, total] = await Promise.all([
    Question.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Question.countDocuments(query),
  ]);

  return {
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    items,
  };
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

const MAX_SEEN_IDS = 1200;

export async function getSeenIds(userId) {
  if (!userId) return [];
  const rows = await QuestionHistory.find({ userId })
    .sort({ lastSeenAt: -1 })
    .limit(MAX_SEEN_IDS)
    .select({ questionId: 1 })
    .lean();
  return rows.map((r) => r.questionId);
}

async function sampleQuestions(filter, size) {
  if (size <= 0) return [];
  return Question.aggregate([{ $match: filter }, { $sample: { size } }]);
}

export function shuffleOptions(question) {
  const optionOrder = [0, 1, 2, 3];
  for (let i = optionOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [optionOrder[i], optionOrder[j]] = [optionOrder[j], optionOrder[i]];
  }
  return { optionOrder, correctIndex: optionOrder.indexOf(question.correct) };
}

/**
 * Normal-run preselection: unseen approved questions first, then the least
 * recently seen ones (pool rotation), with no duplicates inside the run.
 */
export async function pickNormalQuestions({ userId, count, category }) {
  const base = { status: 'approved', retired: { $ne: true } };
  if (category && category !== 'all') base.category = category;

  const seenIds = await getSeenIds(userId);
  const seen = new Set(seenIds);
  let picked = [];

  if (seenIds.length) {
    picked = await sampleQuestions({ ...base, questionId: { $nin: seenIds } }, count);
  }

  // Pool exhaustion / top-up: reuse the LEAST recently seen questions first.
  // This is the documented, predictable rotation policy.
  if (picked.length < count && seenIds.length) {
    const pickedIds = new Set(picked.map((q) => q.questionId));
    const history = await QuestionHistory.find({ userId })
      .sort({ lastSeenAt: 1 })
      .limit((count - picked.length) * 5)
      .select({ questionId: 1 })
      .lean();
    const ids = history.map((h) => h.questionId).filter((id) => !pickedIds.has(id));
    if (ids.length) {
      const docs = await Question.find({ ...base, questionId: { $in: ids } }).lean();
      const byId = new Map(docs.map((d) => [d.questionId, d]));
      for (const id of ids) {
        if (picked.length >= count) break;
        const doc = byId.get(id);
        if (doc) picked.push(doc);
      }
    }
  }

  // Final guard: a bank smaller than the requested count still fills the run.
  if (picked.length < count) {
    const exclude = picked.map((q) => q.questionId);
    const extra = await sampleQuestions(
      { ...base, ...(exclude.length ? { questionId: { $nin: exclude } } : {}) },
      count - picked.length
    );
    picked = picked.concat(extra);
  }

  return {
    questions: picked.slice(0, count),
    rotated: picked.some((q) => seen.has(q.questionId)),
  };
}

export function buildTopicPlan(count, weakTopics = [], strongTopics = [], random = Math.random) {
  const weak = [...new Set(weakTopics.map((t) => (typeof t === 'string' ? t : t?.topic)).filter((t) => TOPIC_SET.has(t)))];
  const strong = [...new Set(strongTopics.map((t) => (typeof t === 'string' ? t : t?.topic)).filter((t) => TOPIC_SET.has(t) && !weak.includes(t)))];
  const neutral = TOPICS.filter((t) => !weak.includes(t) && !strong.includes(t));

  let weakSlots = weak.length ? Math.round(count * 0.45) : 0;
  const strongSlots = strong.length ? Math.round(count * 0.2) : 0;
  let neutralSlots = Math.max(0, count - weakSlots - strongSlots);
  if (!neutral.length) {
    neutralSlots = 0;
    weakSlots += count - weakSlots - strongSlots;
  }

  const plan = [];
  const push = (topics, slots) => {
    if (!topics.length || slots <= 0) return;
    for (let i = 0; i < slots; i++) plan.push(topics[i % topics.length]);
  };
  push(shuffleArray(weak, random), weakSlots);
  push(shuffleArray(strong, random), strongSlots);
  push(neutral.length ? shuffleArray(neutral, random) : TOPICS, neutralSlots);

  const filler = [...new Set([...weak, ...strong, ...neutral, ...TOPICS])];
  for (let i = 0; plan.length < count; i++) plan.push(filler[i % filler.length]);

  return shuffleArray(plan.slice(0, count), random);
}

function shuffleArray(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function stepDifficulty(level, delta) {
  const i = DIFFICULTIES.indexOf(level);
  const base = i < 0 ? 1 : i;
  return DIFFICULTIES[Math.min(DIFFICULTIES.length - 1, Math.max(0, base + delta))];
}

/**
 * Adaptive next question: preferred topic first, nearest difficulty second,
 * and only then relax the constraints. Unseen questions are preferred; when
 * the user has attempted everything, the least-recently-served questions are
 * allowed again so the quiz always finishes.
 */
export async function pickAdaptiveQuestion(session) {
  const index = session.questions.length;
  const targetTopic = session.topicPlan[index] || null;
  const level = session.currentDifficulty || 'easy';
  const asked = session.askedIds || [];
  const seen = session.seenIds || [];

  const base = { status: 'approved', retired: { $ne: true } };
  if (asked.length) base.questionId = { $nin: asked };

  const attempts = [
    { ...base, topic: targetTopic, difficulty: level, questionId: { $nin: [...asked, ...seen] } },
    { ...base, topic: targetTopic, questionId: { $nin: [...asked, ...seen] } },
    { ...base, difficulty: level, questionId: { $nin: [...asked, ...seen] } },
    { ...base, topic: targetTopic, difficulty: level },
    { ...base, topic: targetTopic },
    { ...base, difficulty: level },
    { ...base },
  ].filter((f) => !f.topic || TOPIC_SET.has(f.topic));

  for (const filter of attempts) {
    if (filter.questionId && !filter.questionId.$nin.length) delete filter.questionId;
    const [doc] = await sampleQuestions(filter, 1);
    if (doc) return { doc, isNew: !seen.includes(doc.questionId), relaxed: filter !== attempts[0] };
  }
  return null;
}

/** Public client shape - never includes `correct` or the explanation. */
export function clientQuestion(doc, { optionOrder, isNew }) {
  return {
    id: doc.questionId,
    question: doc.text,
    options: optionOrder.map((i) => doc.options[i]),
    topic: doc.topic,
    topicLabel: TOPIC_LABELS[doc.topic] || doc.topic,
    subtopic: doc.subtopic || '',
    difficulty: doc.difficulty,
    category: doc.category || 'general',
    source: doc.source,
    isNew: !!isNew,
  };
}

/** Record answered questions for this user (idempotent on the compound key). */
export async function recordQuestionHistory(userId, answered) {
  if (!userId || !Array.isArray(answered) || !answered.length) return;
  const now = new Date();
  await QuestionHistory.bulkWrite(
    answered.map((a) => ({
      updateOne: {
        filter: { userId, questionId: a.questionId },
        update: {
          $inc: { timesSeen: 1, timesCorrect: a.correct ? 1 : 0 },
          $set: { lastCorrect: !!a.correct, lastSeenAt: now },
          $setOnInsert: { firstSeenAt: now },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

export async function approvedQuestionCount() {
  return Question.countDocuments({ status: 'approved', retired: { $ne: true } });
}
