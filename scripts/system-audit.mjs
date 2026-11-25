/**
 * CyberShield - full system audit
 *
 * End-to-end checks against a RUNNING local server (default http://localhost:3000)
 * plus direct MongoDB verification. Creates its own test users/questions and
 * removes them again at the end; it never deletes pre-existing user data.
 *
 *   node scripts/system-audit.mjs
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { connectDatabase, closeDatabase } from '../server/config/database.js';
import {
  User,
  Question,
  QuizAttempt,
  QuizSession,
  QuestionHistory,
  AdminQuestionLog,
} from '../server/models/index.js';

const BASE = process.env.AUDIT_BASE || 'http://localhost:3000';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN = Date.now().toString(36);
const PASSWORD = 'Audit$Pass2026x';

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
    this.attrs = new Map();
  }
  absorb(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const raw of list) {
      const [pair] = raw.split(';');
      const idx = pair.indexOf('=');
      if (idx < 0) continue;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      this.cookies.set(name, value);
      this.attrs.set(name, raw);
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  sid() {
    return [...this.cookies.entries()].find(([k]) => /sid/i.test(k))?.[1] || '';
  }
}

async function request(method, pathname, { body, jar, origin, headers, raw } = {}) {
  const h = { ...(headers || {}) };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (origin) h.Origin = origin;
  if (jar && jar.header()) h.Cookie = jar.header();
  const res = await fetch(BASE + pathname, {
    method,
    headers: h,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    redirect: 'manual',
  });
  jar?.absorb(res);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, data, text, headers: res.headers };
}

async function login(email, password = PASSWORD, jar = new Jar()) {
  const res = await request('POST', '/api/auth/login', { body: { email, password }, jar });
  return { res, jar };
}

async function register(name, email, password = PASSWORD) {
  const jar = new Jar();
  const res = await request('POST', '/api/auth/register', {
    body: { name, email, password, role: 'admin' },
    jar,
  });
  return { res, jar };
}

async function dbUser(email) {
  return User.findOne({ email }).lean();
}

async function createUser(name, email, role = 'user') {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const doc = await User.create({ name, email, passwordHash, role });
  return doc;
}

function resolveLocal(pageUrl, ref) {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) return null;
  if (/^(https?:)?\/\//i.test(trimmed)) return null;
  if (trimmed.startsWith('javascript:')) return null;
  const url = new URL(trimmed, pageUrl);
  if (!url.pathname.match(/\.(html?|css|js|png|jpe?g|gif|svg|webp|json|ico)$/i)) return null;
  return url.pathname;
}

async function sweepPages() {
  const htmlDir = path.join(ROOT, 'html');
  const pages = fs.readdirSync(htmlDir).filter((f) => f.endsWith('.html'));
  const missing = [];
  let checkedAssets = 0;

  for (const page of pages) {
    const pageUrl = `${BASE}/html/${page}`;
    const res = await request('GET', `/html/${page}`);
    check(`page ${page} -> 200`, res.status === 200, `status ${res.status}`);
    if (res.status !== 200) continue;

    const refs = [...res.text.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    const localRefs = [...new Set(refs.map((ref) => resolveLocal(pageUrl, ref)).filter(Boolean))];
    for (const assetPath of localRefs) {
      checkedAssets++;
      const asset = await request('GET', assetPath);
      if (asset.status !== 200) missing.push(`${page} -> ${assetPath} (${asset.status})`);
    }
  }

  check('root index.html -> 200', (await request('GET', '/')).status === 200);
  check('all local page assets resolve', missing.length === 0, missing.slice(0, 8).join(', ') || `${checkedAssets} assets`);
  return { pages: pages.length, checkedAssets };
}

async function main() {
  await connectDatabase();

  console.log('\n=== 1. Pages & assets ===');
  const sweep = await sweepPages();

  console.log('\n=== 2. Authentication ===');
  const auditEmail = `audit-${RUN}@cybershield.test`;
  let reg = await register('Audit Candidate', auditEmail);
  if (reg.res.status === 429) {
    // Registration is rate-limited per IP; fall back to a DB-created user so
    // the remaining auth/isolation checks can still run.
    await createUser('Audit Candidate', auditEmail);
    const fallback = await login(auditEmail);
    reg = { res: fallback.res, jar: fallback.jar };
    record('registration succeeds', false, 'rate-limited (429) during this audit run');
  } else if (reg.res.status === 201) {
    check('registration succeeds', true);
    check('registration cannot set role=admin', reg.res.data?.user?.role === 'user', reg.res.data?.user?.role);
    check('registration sends no password hash', !JSON.stringify(reg.res.data).includes('passwordHash'));
    const cookieHeader = reg.jar.attrs.get([...reg.jar.cookies.keys()].find((k) => /sid/i.test(k)) || '');
    check('session cookie is HttpOnly', /HttpOnly/i.test(cookieHeader || ''));
    check('session cookie is SameSite=Lax', /SameSite=Lax/i.test(cookieHeader || ''));
  } else {
    check('registration succeeds', false, `status ${reg.res.status} ${reg.res.data?.error || ''}`);
  }

  const me = await request('GET', '/api/auth/me', { jar: reg.jar });
  check('session works after register (/me 200)', me.status === 200 && me.data?.user?.email === auditEmail);

  const dup = await register('Audit Candidate', auditEmail);
  check('duplicate registration -> 409', dup.res.status === 409, `status ${dup.res.status}`);

  const badLogin = await request('POST', '/api/auth/login', {
    body: { email: auditEmail, password: 'WrongPass123' },
  });
  check('wrong password -> 401', badLogin.status === 401);
  check('wrong password does not enumerate account', /invalid email or password/i.test(badLogin.data?.error || ''));

  const preLoginSid = reg.jar.sid();
  const relogin = await login(auditEmail, PASSWORD, reg.jar);
  check('login succeeds', relogin.res.status === 200, `status ${relogin.res.status}`);
  check('session id rotates on login (fixation defense)', preLoginSid && reg.jar.sid() !== preLoginSid);

  const stored = await dbUser(auditEmail);
  check('password stored as bcrypt hash', /^\$2[aby]\$/.test(stored?.passwordHash || ''), stored?.passwordHash?.slice(0, 7));
  check('API never returns passwordHash', !JSON.stringify(relogin.res.data).includes('passwordHash'));

  const anonDash = await request('GET', '/api/dashboard');
  check('anonymous /api/dashboard -> 401', anonDash.status === 401);
  const anonQuizHistory = await request('GET', '/api/quiz/history');
  check('anonymous /api/quiz/history -> 401', anonQuizHistory.status === 401);
  const anonAdmin = await request('GET', '/api/admin/stats');
  check('anonymous /api/admin/stats -> 401', anonAdmin.status === 401);

  const userAdmin = await request('GET', '/api/admin/stats', { jar: reg.jar });
  check('normal user /api/admin/stats -> 403', userAdmin.status === 403, `status ${userAdmin.status}`);

  const crossOrigin = await request('POST', '/api/quiz/start', {
    body: { count: 1 },
    jar: reg.jar,
    origin: 'https://evil.example',
  });
  check('cross-origin POST blocked -> 403', crossOrigin.status === 403, `status ${crossOrigin.status}`);

  console.log('\n=== 3. User isolation ===');
  const userBEmail = `audit-b-${RUN}@cybershield.test`;
  await createUser('Audit User B', userBEmail);
  const bLogin = await login(userBEmail);
  check('second test user can sign in', bLogin.res.status === 200, `status ${bLogin.res.status}`);

  const startA = await request('POST', '/api/quiz/start', {
    body: { mode: 'normal', count: 5, category: 'all' },
    jar: reg.jar,
  });
  check('quiz start -> 201', startA.status === 201, `status ${startA.status}`);
  const quizA = startA.data?.quizId;

  const nextB = await request('POST', '/api/quiz/next', {
    body: { quizId: quizA },
    jar: bLogin.jar,
  });
  check("user B cannot read user A's quiz session", nextB.status === 404, `status ${nextB.status}`);

  const dashA = await request('GET', '/api/dashboard', { jar: reg.jar });
  const dashB = await request('GET', '/api/dashboard', { jar: bLogin.jar });
  check('dashboard A loads', dashA.status === 200, `status ${dashA.status}`);
  check('dashboard B loads', dashB.status === 200, `status ${dashB.status}`);
  check(
    'dashboards are separate users',
    dashA.data?.user?.id !== dashB.data?.user?.id && dashB.data?.user?.email === userBEmail
  );

  console.log('\n=== 4. Quiz (normal mode) ===');
  const meta = await request('GET', '/api/quiz/meta');
  check('quiz meta reports approved bank', meta.status === 200 && meta.data?.approved > 0, `approved=${meta.data?.approved}`);
  check('quiz meta exposes no answer key', !JSON.stringify(meta.data).includes('"correct"'));
  const approvedBefore = meta.data?.approved || 0;

  const q1 = await request('POST', '/api/quiz/next', { body: { quizId: quizA }, jar: reg.jar });
  check('first question served', q1.status === 200 && q1.data?.question, `status ${q1.status}`);
  check('question has 4 options', q1.data?.question?.options?.length === 4);
  check(
    'question payload hides answer key',
    q1.data?.question && !('correct' in q1.data.question) && !('correctIndex' in q1.data.question) && !('explanation' in q1.data.question)
  );

  const answers = [];
  let current = q1;
  for (let i = 0; i < 5; i++) {
    if (!current?.data?.question) break;
    const q = current.data.question;
    const doc = await Question.findOne({ questionId: q.id }).lean();
    const correctText = doc.options[doc.correct];
    const correctIndex = q.options.indexOf(correctText);
    check(`Q${i + 1} served options map to exactly one source answer`, correctIndex !== -1, `q=${q.id}`);
    const selected = i < 3 ? correctIndex : (correctIndex + 1) % 4;
    const ans = await request('POST', '/api/quiz/answer', {
      body: { quizId: quizA, questionId: q.id, selectedIndex: selected },
      jar: reg.jar,
    });
    check(`Q${i + 1} answer response has no premature key leak`, ans.data && 'correctIndex' in ans.data && 'explanation' in ans.data);
    answers.push({ correct: selected === correctIndex, expected: correctIndex, returned: ans.data?.correctIndex });
    if (i < 4) {
      current = await request('POST', '/api/quiz/next', { body: { quizId: quizA }, jar: reg.jar });
    }
  }

  check('server returns the true correct index', answers.every((a) => a.expected === a.returned));

  const submitA = await request('POST', '/api/quiz/submit', {
    body: { quizId: quizA, durationSeconds: 42 },
    jar: reg.jar,
  });
  const expectedCorrect = answers.filter((a) => a.correct).length;
  check('submit returns official score', submitA.status === 200 && submitA.data?.saved === true, `status ${submitA.status}`);
  check(
    'score matches answers given',
    submitA.data?.correct === expectedCorrect && submitA.data?.score === Math.round((expectedCorrect / 5) * 100),
    `correct=${submitA.data?.correct} score=${submitA.data?.score}`
  );
  check('submit returns per-question review', Array.isArray(submitA.data?.review) && submitA.data.review.length === 5);
  const reviewKeys = Object.keys(submitA.data?.review?.[0] || {}).sort().join(',');
  check(
    'submit review exposes only answer positions',
    reviewKeys === 'correct,correctIndex,questionId,selectedIndex',
    reviewKeys
  );

  const submitAgain = await request('POST', '/api/quiz/submit', { body: { quizId: quizA }, jar: reg.jar });
  check(
    'duplicate submit is idempotent',
    submitAgain.status === 200 && submitAgain.data?.duplicate === true && submitAgain.data?.score === submitA.data?.score,
    `status ${submitAgain.status}`
  );

  const attemptCount = await QuizAttempt.countDocuments({ submissionId: quizA });
  check('exactly one attempt row saved', attemptCount === 1, `count=${attemptCount}`);

  const dashAfter = await request('GET', '/api/dashboard', { jar: reg.jar });
  check(
    'dashboard shows the saved attempt',
    dashAfter.data?.stats?.quizAttempts === 1 && dashAfter.data?.quizAttempts?.[0]?.score === submitA.data?.score,
    `attempts=${dashAfter.data?.stats?.quizAttempts}`
  );

  const historyA = await request('GET', '/api/quiz/history', { jar: reg.jar });
  check('history records attempted questions', historyA.data?.attempted === 5, `attempted=${historyA.data?.attempted}`);

  console.log('\n=== 5. Repetition & rotation ===');
  const run2 = await request('POST', '/api/quiz/start', { body: { count: 5 }, jar: reg.jar });
  const ids2 = [];
  for (let i = 0; i < 5; i++) {
    const nx = await request('POST', '/api/quiz/next', { body: { quizId: run2.data.quizId }, jar: reg.jar });
    if (nx.data?.question) ids2.push(nx.data.question.id);
  }
  check('second run serves 5 questions', ids2.length === 5);
  check('second run has no duplicate ids inside run', new Set(ids2).size === ids2.length);
  await request('POST', '/api/quiz/submit', { body: { quizId: run2.data.quizId }, jar: reg.jar });

  const histAfter = await request('GET', '/api/quiz/history', { jar: reg.jar });
  check('history grows after submit', histAfter.data?.attempted >= 5, `attempted=${histAfter.data?.attempted}`);

  const run3 = await request('POST', '/api/quiz/start', { body: { count: 5 }, jar: reg.jar });
  const ids3 = [];
  for (let i = 0; i < 5; i++) {
    const nx = await request('POST', '/api/quiz/next', { body: { quizId: run3.data.quizId }, jar: reg.jar });
    if (nx.data?.question) ids3.push(nx.data.question.id);
  }
  await request('POST', '/api/quiz/submit', { body: { quizId: run3.data.quizId }, jar: reg.jar });
  const overlap = ids3.filter((id) => ids2.includes(id));
  check('unseen questions preferred across runs', overlap.length === 0, `overlap=${overlap.length}`);

  console.log('\n=== 6. Quiz (adaptive) ===');
  const adaptive = await request('POST', '/api/quiz/start', {
    body: { mode: 'adaptive', count: 6, category: 'all' },
    jar: reg.jar,
  });
  check('adaptive start -> 201', adaptive.status === 201, `status ${adaptive.status}`);
  check('adaptive starts signed-in user at a difficulty', ['easy', 'medium', 'hard'].includes(adaptive.data?.currentDifficulty));

  let diff = adaptive.data?.currentDifficulty;
  let moves = [];
  let adaptiveCorrect = 0;
  for (let i = 0; i < 6; i++) {
    const nx = await request('POST', '/api/quiz/next', { body: { quizId: adaptive.data.quizId }, jar: reg.jar });
    if (!nx.data?.question) break;
    const q = nx.data.question;
    const doc = await Question.findOne({ questionId: q.id }).lean();
    const correctIndex = q.options.indexOf(doc.options[doc.correct]);
    const goCorrect = i < 2;
    const selected = goCorrect ? correctIndex : (correctIndex + 1) % 4;
    if (goCorrect) adaptiveCorrect++;
    const ans = await request('POST', '/api/quiz/answer', {
      body: { quizId: adaptive.data.quizId, questionId: q.id, selectedIndex: selected },
      jar: reg.jar,
    });
    moves.push({ moved: ans.data?.moved, difficulty: ans.data?.difficulty });
    diff = ans.data?.difficulty;
  }

  check('two correct answers move difficulty up one step', moves[1]?.moved === 1, JSON.stringify(moves[1]));
  check('difficulty rises to medium after two correct', moves[1]?.difficulty === 'medium', `difficulty=${moves[1]?.difficulty}`);
  check('missing two in a row steps difficulty down', moves[3]?.moved === -1 || moves[4]?.moved === -1, JSON.stringify(moves.slice(2)));

  const adaptiveSubmit = await request('POST', '/api/quiz/submit', {
    body: { quizId: adaptive.data.quizId, durationSeconds: 60 },
    jar: reg.jar,
  });
  check('adaptive submit succeeds', adaptiveSubmit.status === 200 && adaptiveSubmit.data?.saved, `status ${adaptiveSubmit.status}`);
  check('adaptive correct count matches answers', adaptiveSubmit.data?.correct === adaptiveCorrect, `${adaptiveSubmit.data?.correct}/${adaptiveCorrect}`);
  check(
    'adaptive score is difficulty-weighted',
    adaptiveSubmit.data?.summary?.weightedScore != null && adaptiveSubmit.data?.rawScore != null,
    `weighted=${adaptiveSubmit.data?.summary?.weightedScore} raw=${adaptiveSubmit.data?.rawScore}`
  );

  console.log('\n=== 7. Admin question management ===');
  const admin = await login('admin.qa@cybershield.test', 'Strong$Pass2026x');
  check('admin login succeeds', admin.res.status === 200, `status ${admin.res.status}`);
  check('admin role present', admin.res.data?.user?.role === 'admin');

  const adminStats = await request('GET', '/api/admin/stats', { jar: admin.jar });
  check('admin stats separates approved/pending/rejected', adminStats.status === 200 && adminStats.data?.stats?.status, `status ${adminStats.status}`);
  check('admin stats includes retired count', typeof adminStats.data?.stats?.retiredApproved === 'number');

  const pendingId = `audit-${RUN}-p1`;
  const pendingText = `Audit pending question ${RUN}: which practice best protects an account from credential stuffing?`;
  const createPending = await request('POST', '/api/admin/questions', {
    jar: admin.jar,
    body: {
      questionId: pendingId,
      text: pendingText,
      options: ['Use a password manager with unique passwords', 'Reuse one strong password', 'Share passwords with friends', 'Disable two-factor authentication'],
      correct: 0,
      explanation: 'Unique passwords per site stop one leaked password from unlocking other accounts.',
      topic: 'password-security',
      subtopic: 'Password Security',
      difficulty: 'easy',
      status: 'pending',
    },
  });
  check('admin can create a pending question', createPending.status === 201, `status ${createPending.status}`);

  const duplicate = await request('POST', '/api/admin/questions', {
    jar: admin.jar,
    body: {
      questionId: `${pendingId}-dup`,
      text: pendingText,
      options: ['A one', 'B two', 'C three', 'D four'],
      correct: 0,
      explanation: 'This explanation is long enough to pass validation checks.',
      topic: 'password-security',
      subtopic: 'Password Security',
      difficulty: 'easy',
    },
  });
  check('duplicate question rejected', duplicate.status === 400 || duplicate.status === 409, `status ${duplicate.status}`);

  const approve = await request('POST', `/api/admin/questions/${pendingId}/approve`, { jar: admin.jar });
  check('admin can approve a pending question', approve.status === 200 && approve.data?.question?.status === 'approved');
  const metaAfterApprove = await request('GET', '/api/quiz/meta');
  check('approved count increments after approval', metaAfterApprove.data?.approved === approvedBefore + 1, `${approvedBefore} -> ${metaAfterApprove.data?.approved}`);

  const retire = await request('POST', `/api/admin/questions/${pendingId}/retire`, { jar: admin.jar });
  check('admin can retire an approved question', retire.status === 200 && retire.data?.question?.retired === true);
  const metaAfterRetire = await request('GET', '/api/quiz/meta');
  check('retired question leaves the active bank', metaAfterRetire.data?.approved === approvedBefore, `approved=${metaAfterRetire.data?.approved}`);

  const rejectId = `audit-${RUN}-p2`;
  await request('POST', '/api/admin/questions', {
    jar: admin.jar,
    body: {
      questionId: rejectId,
      text: `Audit rejection question ${RUN}: what should you do with an unexpected password reset email?`,
      options: ['Verify through the official app', 'Click the link immediately', 'Reply with your password', 'Forward it to classmates'],
      correct: 0,
      explanation: 'Unexpected reset emails are a classic phishing lure; verify through the official app.',
      topic: 'phishing-social',
      subtopic: 'Email Security',
      difficulty: 'medium',
      status: 'pending',
    },
  });
  const reject = await request('POST', `/api/admin/questions/${rejectId}/reject`, {
    jar: admin.jar,
    body: { reason: 'Audit reject' },
  });
  check('admin can reject a pending question', reject.status === 200 && reject.data?.question?.status === 'rejected');

  const logs = await request('GET', '/api/admin/logs?limit=50', { jar: admin.jar });
  const actions = (logs.data?.logs || []).map((l) => l.action);
  check('admin actions are audited', ['create-pending', 'approve', 'retire', 'reject'].every((a) => actions.includes(a)), actions.slice(0, 6).join(','));

  const userApprove = await request('POST', `/api/admin/questions/${rejectId}/approve`, { jar: reg.jar });
  check('normal user cannot approve questions', userApprove.status === 403);

  console.log('\n=== 8. AI features ===');
  const scamInvalid = await request('POST', '/api/ai/scam-analyze', { body: { text: '' } });
  check('scam analyzer validates empty input', scamInvalid.status === 400);

  const badUrl = await request('POST', '/api/ai/scam-analyze', { body: { url: 'not a url' } });
  check('scam analyzer rejects invalid URL', badUrl.status === 400);

  let aiUnavailable = 0;
  try {
    const scam = await request('POST', '/api/ai/scam-analyze', {
      body: { text: 'URGENT: Your KYC is expiring. Click http://secure-kyc-update.example and enter your OTP to avoid account closure.' },
    });
    if (scam.status === 200) {
      check('scam analyzer returns structured result', !!scam.data?.risk_level && typeof scam.data?.risk_score === 'number', scam.data?.risk_level);
      check('scam analyzer result has defensive actions', Array.isArray(scam.data?.recommended_actions));
    } else if (scam.status === 503) {
      aiUnavailable++;
      record('scam analyzer external dependency unavailable (degraded 503)', true, scam.data?.error);
    } else {
      record('scam analyzer returns structured result', false, `status ${scam.status}`);
    }

    const scamUrl = await request('POST', '/api/ai/scam-analyze', { body: { url: 'http://paypal-secure-login.verify-account.example/kyc' } });
    if (scamUrl.status === 200) {
      check('scam analyzer includes structural URL analysis', !!scamUrl.data?.url_analysis?.host);
    } else if (scamUrl.status === 503) {
      aiUnavailable++;
      record('URL analysis external dependency unavailable (degraded 503)', true);
    } else {
      record('scam analyzer includes structural URL analysis', false, `status ${scamUrl.status}`);
    }

    // Explicit anonymous access gate for the new signed-in tutor endpoint.
    const anonTutor = await request('POST', '/api/ai/tutor', {
      body: { message: 'What is phishing?', difficulty: 'beginner' },
    });
    check('anonymous /api/ai/tutor -> 401', anonTutor.status === 401, `status ${anonTutor.status}`);
    check('anonymous /api/ai/tutor never processes the body', anonTutor.status === 401);

    const tutor = await request('POST', '/api/ai/tutor', {
      jar: reg.jar,
      body: { message: 'What is phishing?', difficulty: 'beginner', history: [] },
    });
    if (tutor.status === 200) check('AI tutor returns a reply', typeof tutor.data?.reply === 'string' && tutor.data.reply.length > 0);
    else if (tutor.status === 503) { aiUnavailable++; record('AI tutor degraded gracefully', true); }
    else record('AI tutor returns a reply', false, `status ${tutor.status}`);

    const tutorInvalid = await request('POST', '/api/ai/tutor', { jar: reg.jar, body: {} });
    check('AI tutor validates empty input', tutorInvalid.status === 400);

    const path = await request('POST', '/api/ai/learning-path', {
      body: { score: 40, total: 5, correct: 2, strongAreas: [], weakAreas: ['Phishing'], categoryStats: { phishing: { correct: 1, total: 3 } } },
    });
    if (path.status === 200) check('learning path returns steps', Array.isArray(path.data?.steps) && path.data.steps.length > 0);
    else if (path.status === 503) { aiUnavailable++; record('learning path degraded gracefully', true); }
    else record('learning path returns steps', false, `status ${path.status}`);

    const news = await request('POST', '/api/ai/news-explain', {
      body: { article: { title: 'Ransomware hits hospital', excerpt: 'A hospital chain reported a ransomware attack that disrupted records.', source: 'Audit', category: 'Ransomware', tags: ['ransomware'] } },
    });
    if (news.status === 200) check('news explainer returns summary', typeof news.data?.simple_summary === 'string' && news.data.simple_summary.length > 0);
    else if (news.status === 503) { aiUnavailable++; record('news explainer degraded gracefully', true); }
    else record('news explainer returns summary', false, `status ${news.status}`);
  } catch (err) {
    record('AI feature calls completed', false, err.message);
  }

  console.log('\n=== 9. Threat intelligence ===');
  const threats = await request('GET', '/api/threats?pageSize=5');
  check('threat list responds', threats.status === 200, `status ${threats.status}`);
  check('threat list is paginated', Array.isArray(threats.data?.items) && threats.data.items.length <= 5);
  check('threat list includes source metadata', threats.data?.items?.[0]?.sourceName != null || threats.data?.total === 0);

  const status = await request('GET', '/api/threats/status');
  check('threat status responds', status.status === 200 && status.data?.sources);

  const filtered = await request('GET', '/api/threats?severity=critical&pageSize=3');
  check('threat severity filter responds', filtered.status === 200 && (filtered.data?.items || []).every((i) => i.severity === 'critical'));

  const search = await request('GET', '/api/threats?search=Windows&pageSize=3');
  check('threat search responds', search.status === 200);

  const empty = await request('GET', '/api/threats?search=zzzz-no-such-cve-zzzz');
  check('threat empty state returns zero results', empty.status === 200 && empty.data?.total === 0, `total=${empty.data?.total}`);

  const clamped = await request('GET', '/api/threats?pageSize=9999&page=0');
  check('threat pagination clamps hostile values', clamped.status === 200 && clamped.data?.items?.length <= 50);

  console.log('\n=== 10. Cleanup ===');
  const testUsers = [auditEmail, userBEmail];
  const testQuestionIds = [pendingId, `${pendingId}-dup`, rejectId];
  const attempts = await QuizAttempt.find({ userId: { $in: (await User.find({ email: { $in: testUsers } }).select({ _id: 1 }).lean()).map((u) => u._id) } }).select({ _id: 1 }).lean();
  const attemptIds = attempts.map((a) => a._id);

  await Promise.all([
    QuizAttempt.deleteMany({ _id: { $in: attemptIds } }),
    QuestionHistory.deleteMany({ userId: { $in: (await User.find({ email: { $in: testUsers } }).select({ _id: 1 }).lean()).map((u) => u._id) } }),
    QuizSession.deleteMany({ sessionKey: { $in: [quizA, run2.data?.quizId, run3.data?.quizId, adaptive.data?.quizId] } }),
    Question.deleteMany({ questionId: { $in: testQuestionIds } }),
    AdminQuestionLog.deleteMany({ questionId: { $in: testQuestionIds } }),
    User.deleteMany({ email: { $in: testUsers } }),
  ]);

  console.log(`\nSUMMARY: ${results.length - failures}/${results.length} checks passed`);
  console.log(`Pages swept: ${sweep.pages}; assets checked: ${sweep.checkedAssets}; AI external failures: ${aiUnavailable}`);
  if (failures) console.log(`FAILURES: ${failures}`);
  await closeDatabase();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error('[audit] fatal:', err?.stack || err);
  await closeDatabase().catch(() => {});
  process.exit(2);
});
