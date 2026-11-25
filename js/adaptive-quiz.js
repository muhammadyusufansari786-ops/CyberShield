/**
 * CyberShield - adaptive quiz engine (client-side, no dependencies)
 *
 * Pure logic: given a server-computed profile and the local question bank it
 * decides which topic to practise next, at which difficulty, and how to score
 * the run. It never talks to the network and never needs Gemini.
 *
 * Documented rules (mirrored in server/services/adaptive.js):
 *
 *  Difficulty
 *   - Start level = profile.currentDifficulty (server-side decision).
 *   - A rolling window of the last 12 answers is inspected, but a level only
 *     moves after TWO consecutive answers in the same direction, so one lucky
 *     or unlucky question can never change anything.
 *   - 2 correct in a row  -> step one level up (max hard)
 *   - 2 incorrect in a row -> step one level down (min easy)
 *   - Mixed results keep the current level.
 *   - After a move the streak resets, so two more answers are required before
 *     the next change: at most one level movement per two questions.
 *
 *  Topic weighting
 *   - Weak topics (server: accuracy < 60% with >= 3 answers) get 45% of slots.
 *   - Strong topics (>= 80%) keep 20% of slots for maintenance.
 *   - The rest is spread round-robin over the remaining topics.
 *   - With no history every topic is treated as neutral -> a balanced
 *     beginner assessment at easy/medium.
 *
 *  Scoring
 *   - Weighted score: easy 1, medium 1.5, hard 2 points per correct answer,
 *     divided by the total weight asked. Raw accuracy is shown separately, so
 *     harder questions never secretly penalise the learner.
 */
(function () {
  'use strict';

  const DIFFICULTIES = ['easy', 'medium', 'hard'];
  const DIFFICULTY_WEIGHT = { easy: 1, medium: 1.5, hard: 2 };
  const WINDOW = 12;
  const STREAK_TO_MOVE = 2;

  const TOPIC_LABELS = {
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

  const ALL_TOPICS = Object.keys(TOPIC_LABELS);

  function step(level, delta) {
    const i = DIFFICULTIES.indexOf(level);
    const base = i < 0 ? 1 : i;
    return DIFFICULTIES[Math.min(DIFFICULTIES.length - 1, Math.max(0, base + delta))];
  }

  function difficultyIndex(level) {
    const i = DIFFICULTIES.indexOf(level);
    return i < 0 ? 0 : i;
  }

  /** Nearest-first order of difficulties around a target level. */
  function difficultyOrder(target) {
    const index = difficultyIndex(target);
    return DIFFICULTIES
      .map((level, i) => ({ level, distance: Math.abs(i - index) }))
      .sort((a, b) => a.distance - b.distance || b.distance - a.distance)
      .map((entry) => entry.level);
  }

  function shuffle(list, random) {
    const rnd = typeof random === 'function' ? random : Math.random;
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function unique(list) {
    return [...new Set(list)];
  }

  /**
   * Build the per-question topic plan for a run.
   * @param {number} count number of questions
   * @param {Array} weakTopics  [{topic, ...}]
   * @param {Array} strongTopics [{topic, ...}]
   * @param {Function} random
   */
  function buildTopicPlan(count, weakTopics, strongTopics, random) {
    const weak = unique((weakTopics || []).map((t) => t.topic).filter((t) => TOPIC_LABELS[t]));
    const strong = unique((strongTopics || []).map((t) => t.topic).filter((t) => TOPIC_LABELS[t] && !weak.includes(t)));
    const neutral = ALL_TOPICS.filter((t) => !weak.includes(t) && !strong.includes(t));

    let weakSlots = weak.length ? Math.round(count * 0.45) : 0;
    let strongSlots = strong.length ? Math.round(count * 0.2) : 0;
    let neutralSlots = Math.max(0, count - weakSlots - strongSlots);
    if (!neutral.length) {
      neutralSlots = 0;
      weakSlots += count - weakSlots - strongSlots;
    }

    const plan = [];
    const pushRoundRobin = (topics, slots) => {
      if (!topics.length || slots <= 0) return;
      const ordered = shuffle(topics, random);
      for (let i = 0; i < slots; i++) plan.push(ordered[i % ordered.length]);
    };

    pushRoundRobin(weak, weakSlots);
    pushRoundRobin(strong, strongSlots);
    pushRoundRobin(neutral.length ? neutral : ALL_TOPICS, neutralSlots);

    // Trim / pad so the plan always has exactly `count` slots.
    while (plan.length > count) plan.pop();
    const filler = unique([...weak, ...strong, ...neutral, ...ALL_TOPICS]);
    let i = 0;
    while (plan.length < count) {
      plan.push(filler[i % filler.length]);
      i++;
    }

    return shuffle(plan, random);
  }

  /**
   * Create an adaptive session.
   * @param {{currentDifficulty?: string, weakTopics?: Array, strongTopics?: Array, seenQuestionIds?: string[]}} profile
   * @param {Array} bank  question bank (id, topic, difficulty, ...)
   * @param {number} count questions requested
   */
  function createSession(profile, bank, count, random) {
    const safeProfile = profile || {};
    const startDifficulty = DIFFICULTIES.includes(safeProfile.currentDifficulty)
      ? safeProfile.currentDifficulty
      : 'easy';

    const seen = new Set(Array.isArray(safeProfile.seenQuestionIds) ? safeProfile.seenQuestionIds : []);
    const all = Array.isArray(bank) ? bank.filter((q) => q && q.id && TOPIC_LABELS[q.topic] && DIFFICULTY_WEIGHT[q.difficulty]) : [];

    // Prefer unseen questions; drop the exclusion if it would leave too small
    // a pool, so the quiz can always be completed.
    let pool = all.filter((q) => !seen.has(q.id));
    if (pool.length < count * 1.5) pool = all.slice();

    const topicPlan = buildTopicPlan(count, safeProfile.weakTopics || [], safeProfile.strongTopics || [], random);

    return {
      count,
      pool,
      topicPlan,
      askedIds: new Set(),
      questions: [],
      answers: [],
      currentDifficulty: startDifficulty,
      startDifficulty,
      streak: 0,
      lastScores: [],
      startedAt: Date.now(),
    };
  }

  /** Choose the next question for the session (difficulty + topic aware). */
  function nextQuestion(session) {
    if (!session || session.questions.length >= session.count) return null;

    const target = session.currentDifficulty;
    const index = session.questions.length;
    const preferredTopic = session.topicPlan[index] || null;
    const available = session.pool.filter((q) => !session.askedIds.has(q.id));
    if (!available.length) return null;

    const byTopic = preferredTopic ? available.filter((q) => q.topic === preferredTopic) : [];
    const levels = difficultyOrder(target);
    const tries = [];

    // 1. Preferred topic first, nearest difficulty to the current level, so a
    //    weak topic keeps getting practice even when the level moves up.
    for (const level of levels) {
      const hit = byTopic.filter((q) => q.difficulty === level);
      if (hit.length) tries.push(hit);
    }
    // 2. Then any topic at the current difficulty (and its neighbours).
    for (const level of levels) {
      const any = available.filter((q) => q.difficulty === level);
      if (any.length) tries.push(any);
    }
    // 3. Last resorts.
    if (byTopic.length) tries.push(byTopic);
    tries.push(available);

    const chosen = tries[0][0];
    session.askedIds.add(chosen.id);
    session.questions.push(chosen);
    return chosen;
  }

  /**
   * Record the answer to the current question and update the difficulty.
   * Returns { moved: -1|0|1, difficulty }.
   */
  function recordAnswer(session, correct, timeSeconds) {
    const current = session.questions[session.questions.length - 1];
    if (!current) return { moved: 0, difficulty: session.currentDifficulty };

    session.answers.push({
      questionId: current.id,
      topic: current.topic,
      difficulty: current.difficulty,
      correct: !!correct,
      timeSeconds: Number(timeSeconds) || 0,
    });

    session.lastScores.push(correct ? 1 : 0);
    if (session.lastScores.length > WINDOW) session.lastScores.shift();

    session.streak = correct
      ? Math.max(1, session.streak + 1)
      : Math.min(-1, session.streak - 1);

    let moved = 0;
    if (session.streak >= STREAK_TO_MOVE) {
      const next = step(session.currentDifficulty, 1);
      if (next !== session.currentDifficulty) moved = 1;
      session.currentDifficulty = next;
      session.streak = 0;
    } else if (session.streak <= -STREAK_TO_MOVE) {
      const next = step(session.currentDifficulty, -1);
      if (next !== session.currentDifficulty) moved = -1;
      session.currentDifficulty = next;
      session.streak = 0;
    }

    return { moved, difficulty: session.currentDifficulty };
  }

  /** Weighted + raw scores and the full post-quiz breakdown. */
  function summarize(session) {
    const answers = session.answers;
    const total = answers.length;
    let weightSum = 0;
    let weightCorrect = 0;
    let correct = 0;
    const difficultyDistribution = {};
    const topicMap = new Map();

    DIFFICULTIES.forEach((level) => {
      difficultyDistribution[level] = { asked: 0, correct: 0, label: level.charAt(0).toUpperCase() + level.slice(1) };
    });

    for (const answer of answers) {
      const weight = DIFFICULTY_WEIGHT[answer.difficulty] || 1;
      weightSum += weight;
      difficultyDistribution[answer.difficulty].asked += 1;
      if (answer.correct) {
        weightCorrect += weight;
        correct += 1;
        difficultyDistribution[answer.difficulty].correct += 1;
      }

      const entry = topicMap.get(answer.topic) || { topic: answer.topic, label: TOPIC_LABELS[answer.topic] || answer.topic, correct: 0, total: 0 };
      entry.total += 1;
      if (answer.correct) entry.correct += 1;
      topicMap.set(answer.topic, entry);
    }

    const topicStats = [...topicMap.values()]
      .map((entry) => ({ ...entry, accuracy: Math.round((entry.correct / entry.total) * 100) }))
      .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);

    const weak = topicStats.filter((t) => t.accuracy < 60);
    const strong = topicStats.filter((t) => t.accuracy >= 80);
    const recommended = (weak.length ? weak : topicStats.slice(0, 3)).map((t) => t.label);

    return {
      total,
      correct,
      incorrect: total - correct,
      rawScore: total ? Math.round((correct / total) * 100) : 0,
      weightedScore: weightSum ? Math.round((weightCorrect / weightSum) * 100) : 0,
      difficultyDistribution,
      topicStats,
      weakTopics: weak.map((t) => t.label),
      strongTopics: strong.map((t) => t.label),
      recommendedTopics: recommended,
      startDifficulty: session.startDifficulty,
      finalDifficulty: session.currentDifficulty,
      durationSeconds: Math.max(0, Math.round((Date.now() - session.startedAt) / 1000)),
    };
  }

  const api = {
    DIFFICULTIES,
    DIFFICULTY_WEIGHT,
    TOPIC_LABELS,
    ALL_TOPICS,
    createSession,
    nextQuestion,
    recordAnswer,
    summarize,
    buildTopicPlan,
    step,
  };

  if (typeof window !== 'undefined') window.CyberAdaptive = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
