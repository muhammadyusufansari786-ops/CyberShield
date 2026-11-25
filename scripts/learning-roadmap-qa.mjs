/**
 * CyberShield - personalized learning roadmap QA
 *
 * Creates three throwaway users (no history / weak / strong), produces REAL
 * quiz attempts through the API, then exercises generation, validation,
 * progress persistence, refresh carry-over, isolation and the rule-based
 * Gemini fallback. All test data is removed at the end.
 *
 *   node scripts/learning-roadmap-qa.mjs
 *   FALLBACK_BASE=http://localhost:3002 node scripts/learning-roadmap-qa.mjs
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDatabase, closeDatabase } from '../server/config/database.js';
import {
  User,
  Question,
  QuizAttempt,
  QuizSession,
  QuestionHistory,
  LearningProgress,
} from '../server/models/index.js';

const BASE = process.env.AUDIT_BASE || 'http://localhost:3000';
const FALLBACK_BASE = process.env.FALLBACK_BASE || '';
const RUN = Date.now().toString(36);
const PASSWORD = 'Roadmap$Pass2026x';
const results = [];
let failures = 0;

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -> ${detail}` : ''}`);
}

function check(name, condition, detail = '') {
  record(name, !!condition, detail);
  return !!condition;
}

class Jar {
  constructor() {
    this.cookies = new Map();
  }
  absorb(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const raw of list) {
      const [pair] = raw.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) this.cookies.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function request(base, method, pathname, { body, jar } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (jar?.header()) headers.Cookie = jar.header();
  const res = await fetch(base + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar?.absorb(res);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, data };
}

async function login(base, email) {
  const jar = new Jar();
  const res = await request(base, 'POST', '/api/auth/login', { body: { email, password: PASSWORD }, jar });
  return { res, jar };
}

async function createUser(name, email) {
  return User.create({ name, email, passwordHash: await bcrypt.hash(PASSWORD, 12) });
}

/** One REAL quiz run through the API; reads the key from the DB to choose answers. */
async function takeQuiz(jar, { count = 8, category = 'all', mode = 'normal', correct = true } = {}) {
  const start = await request(BASE, 'POST', '/api/quiz/start', { body: { mode, count, category }, jar });
  if (start.status !== 201) throw new Error(`quiz start failed (${start.status})`);
  const quizId = start.data.quizId;

  for (let i = 0; i < count; i++) {
    const next = await request(BASE, 'POST', '/api/quiz/next', { body: { quizId }, jar });
    if (!next.data?.question) break;
    const question = next.data.question;
    const doc = await Question.findOne({ questionId: question.id }).lean();
    const correctIndex = question.options.indexOf(doc.options[doc.correct]);
    const selected = correct ? correctIndex : (correctIndex + 1) % 4;
    await request(BASE, 'POST', '/api/quiz/answer', {
      body: { quizId, questionId: question.id, selectedIndex: selected },
      jar,
    });
  }
  const submit = await request(BASE, 'POST', '/api/quiz/submit', { body: { quizId, durationSeconds: 60 }, jar });
  if (submit.status !== 200) throw new Error(`quiz submit failed (${submit.status})`);
  return submit.data;
}

async function getRoadmap(base, jar) {
  return request(base, 'GET', '/api/learning/roadmap', { jar });
}

function validateRoadmap(name, body) {
  const roadmap = body?.data?.roadmap || body?.roadmap;
  check(`${name}: roadmap returned`, !!roadmap);
  if (!roadmap) return null;

  const steps = roadmap.steps || [];
  check(`${name}: at least 6 lessons`, steps.length >= 6, `lessons=${steps.length}`);
  const stages = new Set(steps.map((s) => s.stage));
  check(
    `${name}: covers Beginner, Intermediate and Advanced`,
    stages.has('Beginner') && stages.has('Intermediate') && stages.has('Advanced'),
    [...stages].join(',')
  );
  check(
    `${name}: every lesson has objective, exercise, resource and time`,
    steps.every(
      (s) =>
        s.objective && s.exercise && s.resource && Number.isFinite(s.estimatedMinutes) &&
        s.estimatedMinutes >= 5 && s.estimatedMinutes <= 180
    )
  );
  check(
    `${name}: difficulty matches the stage`,
    steps.every(
      (s) =>
        (s.stage === 'Beginner' && s.difficulty === 'easy') ||
        (s.stage === 'Intermediate' && s.difficulty === 'medium') ||
        (s.stage === 'Advanced' && s.difficulty === 'hard')
    )
  );
  check(`${name}: generator is labelled`, ['gemini', 'rule-based'].includes(roadmap.generatedBy), roadmap.generatedBy);
  check(
    `${name}: progress is internally consistent`,
    roadmap.progress.total === steps.length &&
      roadmap.progress.completed === steps.filter((s) => s.completed).length
  );
  return roadmap;
}

async function main() {
  await connectDatabase();

  const emails = {
    fresh: `lp-${RUN}-fresh@cybershield.test`,
    weak: `lp-${RUN}-weak@cybershield.test`,
    strong: `lp-${RUN}-strong@cybershield.test`,
  };
  await createUser('Roadmap Fresh', emails.fresh);
  await createUser('Roadmap Weak', emails.weak);
  await createUser('Roadmap Strong', emails.strong);

  const fresh = await login(BASE, emails.fresh);
  const weak = await login(BASE, emails.weak);
  const strong = await login(BASE, emails.strong);
  check('test users sign in', fresh.res.status === 200 && weak.res.status === 200 && strong.res.status === 200);

  console.log('\n=== Authentication & empty state ===');
  const anonGet = await request(BASE, 'GET', '/api/learning/roadmap');
  const anonPost = await request(BASE, 'POST', '/api/learning/roadmap', { body: {} });
  check('anonymous GET -> 401', anonGet.status === 401, `status ${anonGet.status}`);
  check('anonymous POST -> 401', anonPost.status === 401, `status ${anonPost.status}`);

  const freshBefore = await getRoadmap(BASE, fresh.jar);
  check('new user GET succeeds', freshBefore.status === 200);
  check('new user has no roadmap yet', freshBefore.data?.roadmap === null);
  check('new user has no attempts', freshBefore.data?.hasAttempts === false);

  console.log('\n=== Starter roadmap (no quiz history) ===');
  const freshPost = await request(BASE, 'POST', '/api/learning/roadmap', { body: {}, jar: fresh.jar });
  check('generation succeeds without history', freshPost.status === 201, `status ${freshPost.status}`);
  const freshRoadmap = validateRoadmap('starter', freshPost);
  check('starter roadmap is clearly rule-based/Named', ['gemini', 'rule-based'].includes(freshPost.data?.generatedBy));

  if (freshRoadmap) {
    const snapshot = freshRoadmap.profileSnapshot;
    check('no attempts recorded in snapshot', snapshot?.attempts === 0, `attempts=${snapshot?.attempts}`);
    const fabricated = freshRoadmap.steps.filter((s) => /\d{1,3}\s*%/.test(s.why || ''));
    check('no fabricated accuracy in starter explanations', fabricated.length === 0, `${fabricated.length} lessons quote a %`);
  }

  const firstKey = freshRoadmap?.steps?.[0]?.lessonKey;
  if (firstKey && freshRoadmap) {
    const complete = await request(
      BASE,
      'PATCH',
      `/api/learning/roadmap/${freshRoadmap.id}/lessons/${encodeURIComponent(firstKey)}`,
      { body: { completed: true }, jar: fresh.jar }
    );
    check('lesson can be marked complete', complete.status === 200 && complete.data?.roadmap?.progress?.completed === 1);
    const persisted = await getRoadmap(BASE, fresh.jar);
    check('completion persists on reload', persisted.data?.roadmap?.progress?.completed === 1);
    const undone = await request(
      BASE,
      'PATCH',
      `/api/learning/roadmap/${freshRoadmap.id}/lessons/${encodeURIComponent(firstKey)}`,
      { body: { completed: false }, jar: fresh.jar }
    );
    check('lesson can be marked incomplete', undone.status === 200 && undone.data?.roadmap?.progress?.completed === 0);
  }

  if (freshRoadmap) {
    const badKey = await request(
      BASE,
      'PATCH',
      `/api/learning/roadmap/${freshRoadmap.id}/lessons/not-a-real-lesson`,
      { body: { completed: true }, jar: fresh.jar }
    );
    check('unknown lesson -> 404', badKey.status === 404, `status ${badKey.status}`);

    const badBody = await request(
      BASE,
      'PATCH',
      `/api/learning/roadmap/${freshRoadmap.id}/lessons/${encodeURIComponent(firstKey)}`,
      { body: { completed: 'yes' }, jar: fresh.jar }
    );
    check('non-boolean completed -> 400', badBody.status === 400, `status ${badBody.status}`);

    const foreign = await request(
      BASE,
      'PATCH',
      `/api/learning/roadmap/${freshRoadmap.id}/lessons/${encodeURIComponent(firstKey)}`,
      { body: { completed: true }, jar: strong.jar }
    );
    check("another user cannot modify someone else's roadmap", foreign.status === 404, `status ${foreign.status}`);

    const strongList = await getRoadmap(BASE, strong.jar);
    check('another user does not receive that roadmap', strongList.data?.roadmap === null);
  }

  console.log('\n=== Weak learner (real attempts) ===');
  await takeQuiz(weak.jar, { count: 8, category: 'passwords', correct: false });
  await takeQuiz(weak.jar, { count: 8, category: 'passwords', correct: false });
  const weakProfile = await getRoadmap(BASE, weak.jar);
  check('quiz attempts are recorded', weakProfile.data?.profile?.attempts === 2, `attempts=${weakProfile.data?.profile?.attempts}`);
  check(
    'weak topic is measured from real answers',
    (weakProfile.data?.profile?.weakTopics || []).includes('password-security'),
    JSON.stringify(weakProfile.data?.profile?.weakTopics)
  );
  const weakPost = await request(BASE, 'POST', '/api/learning/roadmap', { body: {}, jar: weak.jar });
  check('weak learner roadmap generated', weakPost.status === 201, `status ${weakPost.status}`);
  const weakRoadmap = validateRoadmap('weak', weakPost);
  if (weakRoadmap) {
    check(
      'weakest topic appears in the roadmap',
      weakRoadmap.steps.some((s) => s.topic === 'password-security'),
      [...new Set(weakRoadmap.steps.map((s) => s.topic))].join(',')
    );
    check(
      'at least one lesson explains the measured weakness',
      weakRoadmap.steps.some(
        (s) =>
          /password-security|password security/i.test(s.why || '') &&
          /\d{1,3}\s*(?:%|percent)/i.test(s.why || '')
      ),
      weakRoadmap.steps[0]?.why
    );
    check('roadmap level comes from measured difficulty', ['easy', 'medium', 'hard'].includes(weakRoadmap.level), weakRoadmap.level);
  }

  // Complete one lesson, then refresh after a third attempt and verify that
  // matching lessons keep their completion state.
  let completedKey = weakRoadmap?.steps?.[0]?.lessonKey;
  if (weakRoadmap && completedKey) {
    await request(
      BASE,
      'PATCH',
      `/api/learning/roadmap/${weakRoadmap.id}/lessons/${encodeURIComponent(completedKey)}`,
      { body: { completed: true }, jar: weak.jar }
    );
    await takeQuiz(weak.jar, { count: 5, category: 'passwords', correct: true });
    const refresh = await request(BASE, 'POST', '/api/learning/roadmap', { body: {}, jar: weak.jar });
    check('refresh after a new attempt succeeds', refresh.status === 201, `status ${refresh.status}`);
    const refreshed = refresh.data?.roadmap;
    check('refresh creates a new active roadmap', refreshed && refreshed.id !== weakRoadmap.id);
    check('refresh uses the latest attempt count', refreshed?.profileSnapshot?.attempts === 3, `attempts=${refreshed?.profileSnapshot?.attempts}`);
    const carried = (refreshed?.steps || []).find((s) => s.lessonKey === completedKey);
    check('completion is preserved for matching lessons', !carried || carried.completed === true, `carried=${carried?.completed}`);
    const active = await getRoadmap(BASE, weak.jar);
    check('only one active roadmap is returned', active.data?.roadmap?.id === refreshed?.id);
  }

  console.log('\n=== Strong learner ===');
  await takeQuiz(strong.jar, { count: 8, category: 'phishing', correct: true });
  await takeQuiz(strong.jar, { count: 8, category: 'phishing', correct: true });
  await takeQuiz(strong.jar, { count: 8, category: 'phishing', correct: true });
  const strongProfile = await getRoadmap(BASE, strong.jar);
  check(
    'strong topic is measured from real answers',
    (strongProfile.data?.profile?.strongTopics || []).includes('phishing-social'),
    JSON.stringify(strongProfile.data?.profile?.strongTopics)
  );
  check(
    'strong learner reaches the hard level',
    strongProfile.data?.profile?.currentDifficulty === 'hard',
    strongProfile.data?.profile?.currentDifficulty
  );
  const strongPost = await request(BASE, 'POST', '/api/learning/roadmap', { body: {}, jar: strong.jar });
  const strongRoadmap = validateRoadmap('strong', strongPost);
  check('strong learner still gets a roadmap', !!strongRoadmap);

  console.log('\n=== Gemini failure fallback ===');
  if (FALLBACK_BASE) {
    const fallbackLogin = await login(FALLBACK_BASE, emails.weak);
    check('fallback server accepts the same account', fallbackLogin.res.status === 200, `status ${fallbackLogin.res.status}`);
    const fallback = await request(FALLBACK_BASE, 'POST', '/api/learning/roadmap', { body: {}, jar: fallbackLogin.jar });
    check('generation still succeeds when Gemini is down', fallback.status === 201, `status ${fallback.status}`);
    const roadmap = validateRoadmap('fallback', fallback);
    check('fallback roadmap is labelled rule-based', fallback.data?.roadmap?.generatedBy === 'rule-based', fallback.data?.roadmap?.generatedBy);
    check('fallback explains why AI was not used', !!fallback.data?.roadmap?.fallbackReason, fallback.data?.roadmap?.fallbackReason);
    const persisted = await getRoadmap(FALLBACK_BASE, fallbackLogin.jar);
    check('fallback roadmap is persisted', persisted.data?.roadmap?.steps?.length >= 6);
  } else {
    record('Gemini failure fallback (set FALLBACK_BASE to run)', false, 'FALLBACK_BASE not provided');
  }

  console.log('\n=== Cleanup ===');
  const users = await User.find({ email: { $in: Object.values(emails) } }).select({ _id: 1 }).lean();
  const ids = users.map((u) => u._id);
  await Promise.all([
    LearningProgress.deleteMany({ userId: { $in: ids } }),
    QuizAttempt.deleteMany({ userId: { $in: ids } }),
    QuestionHistory.deleteMany({ userId: { $in: ids } }),
    QuizSession.deleteMany({ userId: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } }),
  ]);

  console.log(`\nSUMMARY: ${results.length - failures}/${results.length} checks passed`);
  if (failures) console.log(`FAILURES: ${failures}`);
  await closeDatabase();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error('[roadmap-qa] fatal:', err?.stack || err);
  await closeDatabase().catch(() => {});
  process.exit(2);
});
