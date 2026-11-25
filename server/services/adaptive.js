/**
 * CyberShield - adaptive quiz profile
 *
 * Pure server-side analysis of a user's SAVED quiz attempts:
 *   - topic accuracy (weak / strong topics)
 *   - recent improvement per topic
 *   - current difficulty for the next adaptive run
 *   - recently seen question ids (so the next quiz can avoid repeats)
 *
 * Nothing here guesses: topics without enough answers are simply "not
 * measured yet", which the selection algorithm treats as neutral.
 *
 * Difficulty thresholds (documented, also mirrored in js/adaptive-quiz.js):
 *   history answers < 8            -> "easy" (balanced beginner assessment)
 *   no adaptive attempt yet        -> overall average: <50 easy, <80 medium, else hard
 *   latest attempt score < 50      -> step one level DOWN from the last level
 *   latest attempt score >= 85     -> step one level UP from the last level
 *   otherwise                      -> keep the last level
 *   weak topic                     -> accuracy < 60% with >= 3 answers
 *   strong topic                   -> accuracy >= 80% with >= 2 answers
 *   improved topic                 -> newest half of that topic's answers is at
 *                                     least 20 points better than the older half
 */

export const TOPICS = [
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

export const TOPIC_LABELS = {
  'phishing-social': 'Phishing & Social Engineering',
  'password-security': 'Password Security',
  'malware-ransomware': 'Malware & Ransomware',
  'network-security': 'Network Security',
  'identity-theft': 'Identity Theft',
  'financial-fraud': 'Financial Fraud',
  'data-privacy': 'Data Privacy',
  'safe-browsing': 'Safe Browsing',
  'emerging-threats': 'Emerging Cyber Threats',
};

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

/** Weighted scoring: harder questions are worth more, but never penalise. */
export const DIFFICULTY_WEIGHT = { easy: 1, medium: 1.5, hard: 2 };

const HISTORY_WINDOW = 20; // attempts considered for the profile
const MIN_HISTORY_ANSWERS = 8; // below this we run a beginner assessment
const RECENT_ATTEMPTS_FOR_REPEATS = 2; // avoid questions from the last 2 runs
const MAX_SEEN_IDS = 40;

function step(level, delta) {
  const i = DIFFICULTIES.indexOf(level);
  const next = Math.min(DIFFICULTIES.length - 1, Math.max(0, (i < 0 ? 1 : i) + delta));
  return DIFFICULTIES[next];
}

/**
 * Recompute score/correct/total from per-question records.
 * Returns null when the records are unusable.
 */
export function scoreQuestions(questions) {
  if (!Array.isArray(questions) || !questions.length) return null;
  let weightSum = 0;
  let weightCorrect = 0;
  let correct = 0;

  for (const q of questions) {
    const weight = DIFFICULTY_WEIGHT[q?.difficulty];
    if (!weight) return null;
    weightSum += weight;
    if (q.correct === true) {
      weightCorrect += weight;
      correct += 1;
    }
  }

  if (!weightSum) return null;
  return {
    total: questions.length,
    correct,
    rawScore: Math.round((correct / questions.length) * 100),
    score: Math.round((weightCorrect / weightSum) * 100),
  };
}

/** Chronological per-topic answer lists, oldest first. */
function collectTopicHistory(docs) {
  const byTopic = new Map(TOPICS.map((t) => [t, []]));
  // docs are newest-first, so walk backwards for chronological order.
  for (let i = docs.length - 1; i >= 0; i--) {
    const questions = Array.isArray(docs[i].questions) ? docs[i].questions : [];
    for (const q of questions) {
      const list = byTopic.get(q?.topic);
      if (!list || typeof q.correct !== 'boolean') continue;
      list.push(q.correct);
    }
  }
  return byTopic;
}

function accuracyOf(list) {
  if (!list.length) return null;
  return list.filter(Boolean).length / list.length;
}

/**
 * @param {Array} attempts Saved attempts, newest first (already lean docs).
 * @param {{normalAttempts?: number, adaptiveAttempts?: number}} counts
 */
export function buildProfile(attempts = [], counts = {}) {
  const docs = Array.isArray(attempts) ? attempts.slice(0, HISTORY_WINDOW) : [];

  const topicHistory = collectTopicHistory(docs);
  const topicPerformance = [];
  let answeredQuestions = 0;

  for (const topic of TOPICS) {
    const list = topicHistory.get(topic) || [];
    if (!list.length) continue;
    answeredQuestions += list.length;
    const correct = list.filter(Boolean).length;
    topicPerformance.push({
      topic,
      label: TOPIC_LABELS[topic],
      correct,
      total: list.length,
      accuracy: Math.round((correct / list.length) * 100),
    });
  }

  topicPerformance.sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);

  const measured = topicPerformance.filter((t) => t.total >= 2);
  const weakTopics = measured
    .filter((t) => t.total >= 3 && t.accuracy < 60)
    .slice(0, 3);
  if (!weakTopics.length && measured.length && measured[0].accuracy < 80) {
    weakTopics.push(measured[0]);
  }
  const strongTopics = topicPerformance.filter((t) => t.total >= 2 && t.accuracy >= 80).slice(0, 3);

  const improvedTopics = [];
  for (const topic of TOPICS) {
    const list = topicHistory.get(topic) || [];
    if (list.length < 4) continue;
    const half = Math.floor(list.length / 2);
    const older = accuracyOf(list.slice(0, half));
    const newer = accuracyOf(list.slice(half));
    if (older == null || newer == null) continue;
    if (newer - older >= 0.2 && newer >= 0.5) {
      improvedTopics.push({ topic, label: TOPIC_LABELS[topic], delta: Math.round((newer - older) * 100) });
    }
  }

  const scores = docs.map((a) => Number(a.score)).filter((n) => Number.isFinite(n));
  const averageScore = scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : null;
  const lastScore = scores.length ? scores[0] : null;

  const lastAdaptive = docs.find((a) => a.mode === 'adaptive' && a.finalDifficulty);
  let currentDifficulty = 'easy';
  if (!docs.length) {
    currentDifficulty = 'easy';
  } else if (lastAdaptive) {
    currentDifficulty = lastAdaptive.finalDifficulty;
  } else if (averageScore != null) {
    currentDifficulty = averageScore >= 80 ? 'hard' : averageScore >= 50 ? 'medium' : 'easy';
  }

  // At most one level of movement from the most recent result, so the level
  // cannot swing just because of one unusual quiz.
  if (lastScore != null && answeredQuestions >= MIN_HISTORY_ANSWERS) {
    if (lastScore < 50) currentDifficulty = step(currentDifficulty, -1);
    else if (lastScore >= 85) currentDifficulty = step(currentDifficulty, 1);
  }

  const seen = new Set();
  for (const attempt of docs.slice(0, RECENT_ATTEMPTS_FOR_REPEATS)) {
    for (const q of attempt.questions || []) {
      if (q?.questionId) seen.add(String(q.questionId));
      if (seen.size >= MAX_SEEN_IDS) break;
    }
    if (seen.size >= MAX_SEEN_IDS) break;
  }

  return {
    hasHistory: docs.length > 0,
    historySufficient: answeredQuestions >= MIN_HISTORY_ANSWERS,
    answeredQuestions,
    currentDifficulty,
    averageScore,
    lastScore,
    normalAttempts: Number(counts.normalAttempts) || 0,
    adaptiveAttempts: Number(counts.adaptiveAttempts) || 0,
    topicPerformance,
    weakTopics,
    strongTopics,
    improvedTopics,
    seenQuestionIds: [...seen],
  };
}
