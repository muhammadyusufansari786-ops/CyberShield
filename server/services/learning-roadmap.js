/**
 * CyberShield - personalized learning roadmap
 *
 * Builds a staged roadmap (Beginner / Intermediate / Advanced) from MEASURED
 * quiz performance only. Two generators share one output shape:
 *
 *   - Gemini (services/gemini.js -> personalizedRoadmap), validated here;
 *   - a deterministic rule-based planner used when Gemini is unavailable or
 *     returns an incomplete/invalid roadmap.
 *
 * Nothing in this module invents performance: when a topic has no measured
 * accuracy, the wording says so instead of claiming a score.
 */

import { TOPICS, TOPIC_LABELS } from './adaptive.js';

export const STAGE_ORDER = ['Beginner', 'Intermediate', 'Advanced'];
const STAGE_DIFFICULTY = { Beginner: 'easy', Intermediate: 'medium', Advanced: 'hard' };
const STAGE_MINUTES = { Beginner: 20, Intermediate: 30, Advanced: 45 };
const ALLOWED_TYPES = new Set(['Learn', 'Read', 'Practice', 'Take']);
const PAGE_IDS = new Set(['home', 'password', 'quiz', 'news', 'threats', 'toolkit', 'glossary', 'resources', 'ai', 'about']);
const PAGE_ID_BY_FILE = {
  'index.html': 'home',
  'password.html': 'password',
  'quiz.html': 'quiz',
  'news.html': 'news',
  'threats.html': 'threats',
  'toolkit.html': 'toolkit',
  'glossary.html': 'glossary',
  'resources.html': 'resources',
  'ai-assistant.html': 'ai',
  'about.html': 'about',
};

/** Where each topic is best studied at each stage. */
const TOPIC_BLUEPRINT = {
  'phishing-social': {
    learn: { page: 'toolkit', label: 'Scam safety toolkit' },
    practice: { page: 'quiz', label: 'Phishing quiz practice' },
    scenario: { page: 'news', label: 'Phishing news explainer' },
  },
  'password-security': {
    learn: { page: 'password', label: 'Password checker guide' },
    practice: { page: 'quiz', label: 'Password quiz practice' },
    scenario: { page: 'glossary', label: 'Authentication glossary' },
  },
  'malware-ransomware': {
    learn: { page: 'threats', label: 'Malware threat guide' },
    practice: { page: 'quiz', label: 'Malware quiz practice' },
    scenario: { page: 'glossary', label: 'Ransomware glossary' },
  },
  'network-security': {
    learn: { page: 'resources', label: 'Network security resources' },
    practice: { page: 'quiz', label: 'Network quiz practice' },
    scenario: { page: 'news', label: 'Network incident explainer' },
  },
  'identity-theft': {
    learn: { page: 'resources', label: 'Identity theft resources' },
    practice: { page: 'quiz', label: 'Identity quiz practice' },
    scenario: { page: 'glossary', label: 'Identity theft glossary' },
  },
  'financial-fraud': {
    learn: { page: 'toolkit', label: 'Fraud response toolkit' },
    practice: { page: 'quiz', label: 'Fraud quiz practice' },
    scenario: { page: 'news', label: 'UPI fraud explainer' },
  },
  'data-privacy': {
    learn: { page: 'resources', label: 'Data privacy resources' },
    practice: { page: 'quiz', label: 'Privacy quiz practice' },
    scenario: { page: 'news', label: 'Privacy news explainer' },
  },
  'safe-browsing': {
    learn: { page: 'glossary', label: 'Safe browsing glossary' },
    practice: { page: 'quiz', label: 'Safe browsing quiz practice' },
    scenario: { page: 'toolkit', label: 'Browser safety checklist' },
  },
  'emerging-threats': {
    learn: { page: 'threats', label: 'Live threat intelligence' },
    practice: { page: 'quiz', label: 'Emerging threats quiz' },
    scenario: { page: 'news', label: 'AI threat news explainer' },
  },
};

const STARTER_TOPICS = ['password-security', 'phishing-social', 'safe-browsing'];

function clean(value, max) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001F]/g, '').trim().slice(0, max) : '';
}

export function topicLabelOf(topic) {
  return TOPIC_LABELS[topic] || topic;
}

function rowFor(profile, topic) {
  return (profile.topicPerformance || []).find((row) => row.topic === topic) || null;
}

function weakSet(profile) {
  return new Set((profile.weakTopics || []).map((t) => (typeof t === 'string' ? t : t?.topic)).filter(Boolean));
}

function strongSet(profile) {
  return new Set((profile.strongTopics || []).map((t) => (typeof t === 'string' ? t : t?.topic)).filter(Boolean));
}

/** Explains a recommendation using only measured numbers (or says data is missing). */
function whyFor(profile, topic) {
  const row = rowFor(profile, topic);
  const label = topicLabelOf(topic);
  if (!row) {
    return `No quiz data for ${label} yet, so this lesson starts with the fundamentals before you practise it.`;
  }
  const base = `You answered ${row.accuracy}% of ${label} questions correctly (${row.correct}/${row.total}) in your saved quizzes.`;
  if (weakSet(profile).has(topic)) return `${base} This is one of your weakest measured topics, so it comes first.`;
  if (strongSet(profile).has(topic)) return `${base} You are already strong here; this stage keeps the skill sharp.`;
  return `${base} Revising this topic balances your overall performance.`;
}

/**
 * An AI-authored "why" may only quote measured accuracy. If it mentions a
 * percentage that does not match the measured number (or there is no measured
 * data at all), it is rejected and replaced by the measured explanation.
 */
function verifyWhy(rawWhy, topic, profile) {
  const text = clean(rawWhy, 400);
  if (!text) return null;
  const row = rowFor(profile, topic);

  // The model may phrase a number as "40%" or "40 percent", and may quote
  // "3 correct out of 8". Both forms are checked against the measured row so
  // a fabricated score can never reach the page.
  const percents = [...text.matchAll(/(\d{1,3})\s*(?:%|percent)/gi)].map((m) => Number(m[1]));
  const ratios = [...text.matchAll(/(\d{1,3})\s*(?:correct\s*)?out\s*of\s*(\d{1,3})/gi)].map((m) => ({
    correct: Number(m[1]),
    total: Number(m[2]),
  }));

  if (!row && (percents.length || ratios.length)) return null;
  if (row) {
    if (percents.some((n) => n !== row.accuracy)) return null;
    if (ratios.some((r) => r.correct !== row.correct || r.total !== row.total)) return null;
  }
  return text;
}

function resolvePageId(value) {
  const raw = clean(value, 40);
  if (PAGE_IDS.has(raw)) return raw;
  if (PAGE_ID_BY_FILE[raw]) return PAGE_ID_BY_FILE[raw];
  return null;
}

function planFor(topic, stage) {
  const blueprint = TOPIC_BLUEPRINT[topic] || TOPIC_BLUEPRINT['safe-browsing'];
  if (stage === 'Beginner') return blueprint.learn;
  if (stage === 'Intermediate') return blueprint.practice;
  return blueprint.scenario;
}

function objectiveFor(label, stage) {
  if (stage === 'Beginner') return `Explain the most common ${label.toLowerCase()} risks and why they matter to students.`;
  if (stage === 'Intermediate') return `Apply at least two ${label.toLowerCase()} defenses to your own accounts and devices.`;
  return `Evaluate a realistic ${label.toLowerCase()} incident and justify the safest response.`;
}

function exerciseFor(label, stage) {
  if (stage === 'Beginner') return `List three warning signs of ${label.toLowerCase()} and one habit you will change this week.`;
  if (stage === 'Intermediate') return `Complete the ${label} practice quiz and note every question you miss.`;
  return `Work through one ${label} scenario in CyberShield and explain the safest response in two sentences.`;
}

function descriptionFor(label, stage) {
  if (stage === 'Beginner') return `Start with the CyberShield ${label.toLowerCase()} material, then write down the risks that apply to you.`;
  if (stage === 'Intermediate') return `Practise recognising ${label.toLowerCase()} attempts and fix one weak spot in your setup.`;
  return `Test your judgement with scenario-based practice, then review the explanations carefully.`;
}

function titleFor(label, stage) {
  if (stage === 'Beginner') return `Foundations of ${label}`;
  if (stage === 'Intermediate') return `Practise ${label} defenses`;
  return `${label}: real-world scenario`;
}

function buildLesson(topic, stage, profile) {
  const label = topicLabelOf(topic);
  const plan = planFor(topic, stage);
  return {
    lessonKey: `${topic}-${stage.toLowerCase()}`,
    topic,
    topicLabel: label,
    stage,
    difficulty: STAGE_DIFFICULTY[stage],
    type: stage === 'Beginner' ? 'Learn' : stage === 'Intermediate' ? 'Practice' : 'Read',
    title: titleFor(label, stage),
    objective: objectiveFor(label, stage),
    why: whyFor(profile, topic),
    estimatedMinutes: STAGE_MINUTES[stage],
    description: descriptionFor(label, stage),
    resource: plan.page,
    resourceLabel: plan.label,
    exercise: exerciseFor(label, stage),
  };
}

function focusTopics(profile) {
  const measured = (profile.topicPerformance || [])
    .filter((row) => TOPICS.includes(row.topic))
    .slice()
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
  const weak = (profile.weakTopics || [])
    .map((t) => (typeof t === 'string' ? t : t?.topic))
    .filter((t) => TOPICS.includes(t));

  const focus = [...new Set([...weak, ...measured.map((row) => row.topic)])].slice(0, 3);
  const filler = [...measured.map((row) => row.topic), ...STARTER_TOPICS, ...TOPICS];
  while (focus.length < 3) {
    const next = filler.find((topic) => !focus.includes(topic));
    if (!next) break;
    focus.push(next);
  }
  return focus;
}

function summaryFor(profile, attemptsCount, topics) {
  if (!attemptsCount) {
    return 'A starter roadmap covering the fundamentals. Take a quiz and refresh it to adapt to your weakest measured topics.';
  }
  const labels = [...new Set(topics.map(topicLabelOf))];
  const level = (profile.currentDifficulty || 'easy').replace(/^./, (c) => c.toUpperCase());
  return `Built from ${attemptsCount} saved quiz attempt${attemptsCount === 1 ? '' : 's'}, focusing on ${labels.join(', ')}. Current difficulty: ${level}.`;
}

/** Deterministic planner - works with zero or many quiz attempts. */
export function buildRuleBasedRoadmap({ profile = {}, attemptsCount = 0 } = {}) {
  const topics = focusTopics(profile);
  const lessons = [];
  for (const stage of STAGE_ORDER) {
    for (const topic of topics) lessons.push(buildLesson(topic, stage, profile));
  }
  return {
    title: attemptsCount ? 'Your personalized cybersecurity roadmap' : 'Your cybersecurity starter roadmap',
    summary: summaryFor(profile, attemptsCount, topics),
    level: profile.currentDifficulty || 'easy',
    lessons,
  };
}

function normalizeAiLesson(raw, profile) {
  if (!raw || typeof raw !== 'object') return null;

  const topic = clean(raw.topic, 40);
  if (!TOPICS.includes(topic)) return null;

  const stage = clean(raw.stage, 20);
  if (!STAGE_ORDER.includes(stage)) return null;

  const title = clean(raw.title, 140);
  const objective = clean(raw.objective, 300);
  const exercise = clean(raw.exercise, 400);
  if (title.length < 4 || objective.length < 12 || exercise.length < 12) return null;

  const plan = planFor(topic, stage);
  const minutesRaw = Number(raw.estimatedMinutes);
  const minutes = Number.isFinite(minutesRaw)
    ? Math.min(90, Math.max(10, Math.round(minutesRaw)))
    : STAGE_MINUTES[stage];

  return {
    lessonKey: `${topic}-${stage.toLowerCase()}`,
    topic,
    topicLabel: topicLabelOf(topic),
    stage,
    // Difficulty is derived from the stage, never trusted from the model.
    difficulty: STAGE_DIFFICULTY[stage],
    type: ALLOWED_TYPES.has(raw.type) ? raw.type : 'Learn',
    title,
    objective,
    why: verifyWhy(raw.why, topic, profile) || whyFor(profile, topic),
    estimatedMinutes: minutes,
    description: clean(raw.description, 500) || objective,
    resource: resolvePageId(raw.resource) || plan.page,
    resourceLabel: clean(raw.resourceLabel, 100) || plan.label,
    exercise,
  };
}

/**
 * Validates a Gemini roadmap and returns the canonical shape, or null when it
 * is unusable (too short, missing a stage, unknown topics, fabricated scores).
 */
export function normalizeAiRoadmap(data, { profile = {}, attemptsCount = 0 } = {}) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.lessons)) return null;

  const seen = new Set();
  const lessons = [];
  for (const raw of data.lessons.slice(0, 12)) {
    const lesson = normalizeAiLesson(raw, profile);
    if (!lesson || seen.has(lesson.lessonKey)) continue;
    seen.add(lesson.lessonKey);
    lessons.push(lesson);
  }

  if (lessons.length < 6) return null;
  if (new Set(lessons.map((lesson) => lesson.stage)).size < STAGE_ORDER.length) return null;

  const order = new Map(STAGE_ORDER.map((stage, index) => [stage, index]));
  lessons.sort((a, b) => order.get(a.stage) - order.get(b.stage));

  return {
    title: clean(data.title, 160) || (attemptsCount ? 'Your personalized cybersecurity roadmap' : 'Your cybersecurity starter roadmap'),
    summary:
      clean(data.summary, 600) ||
      summaryFor(profile, attemptsCount, [...new Set(lessons.map((lesson) => lesson.topic))]),
    level: profile.currentDifficulty || 'easy',
    lessons,
  };
}

export const LESSON_KEY_RE = /^[a-z0-9-]{2,120}$/i;
