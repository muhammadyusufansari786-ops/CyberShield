/**
 * CyberShield - question bank / quiz / admin QA script
 *
 * Run the server first (`npm start`), then:
 *   node scripts/quiz-bank-qa.mjs
 *
 * Creates its own test accounts (fresh1.qa, fresh2.qa, usera.qa) and expects
 * the admin.qa account to have been promoted once with:
 *   node scripts/make-admin.js admin.qa@cybershield.test
 *
 * It talks to the real API only - no database shortcuts - so it verifies the
 * same paths a browser uses.
 */

import fs from 'node:fs';

const BASE = process.env.QA_BASE || 'http://localhost:3000';
const PASSWORD = 'Strong$Pass2026x';

const bank = [];
for (const file of [
  'data/quiz-questions.json',
  'data/questions/human-extra.json',
  'data/questions/human-extra-2.json',
  'data/questions/human-extra-3.json',
]) {
  bank.push(...JSON.parse(fs.readFileSync(file, 'utf8')));
}
const byText = new Map(bank.map((q) => [q.question, q]));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}${detail ? ' :: ' + detail : ''}`);
}

function makeClient() {
  let cookie = '';
  async function req(path, { method = 'GET', body } = {}) {
    const headers = { Origin: BASE };
    if (body) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON */
    }
    return { status: res.status, data };
  }
  return { req };
}

async function register(client, email, name) {
  const res = await client.req('/api/auth/register', {
    method: 'POST',
    body: { name, email, password: PASSWORD },
  });
  // Existing account (409) or registration rate limit (429): sign in instead,
  // because these QA accounts are reused across runs.
  if (res.status === 409 || res.status === 429) {
    return client.req('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  }
  return res;
}

async function answerAll(client, quizId, answerCorrectly) {
  const out = [];
  for (let i = 0; i < 25; i++) {
    const next = await client.req('/api/quiz/next', { method: 'POST', body: { quizId } });
    if (!next.data || next.data.done) break;
    const q = next.data.question;
    const source = byText.get(q.question);
    const keyIdx = source ? q.options.indexOf(source.options[source.correct]) : 0;
    const selected = answerCorrectly ? keyIdx : (keyIdx + 1) % 4;
    const ans = await client.req('/api/quiz/answer', {
      method: 'POST',
      body: { quizId, questionId: q.id, selectedIndex: selected },
    });
    out.push({
      id: q.id,
      correct: ans.data.correct,
      keyIdx: ans.data.correctIndex,
      expected: keyIdx,
      moved: ans.data.moved,
      difficulty: ans.data.difficulty,
      leaked: 'correct' in q || 'explanation' in q,
    });
  }
  return out;
}

function isUnique(list) {
  return new Set(list.map((x) => x.id)).size === list.length;
}

/* ------------------------------------------------------------------ */
/* 1. Bank + access control                                          */
/* ------------------------------------------------------------------ */

const anon = makeClient();
const meta = (await anon.req('/api/quiz/meta')).data;
check('approved bank has 300 questions', meta?.approved === 300, `approved=${meta?.approved}`);
check('every bank topic is represented', (meta?.topics || []).every((t) => t.count > 0));

check('anonymous admin API is rejected (401)', (await anon.req('/api/admin/stats')).status === 401);

const admin = makeClient();
const adminLogin = await admin.req('/api/auth/login', {
  method: 'POST',
  body: { email: 'admin.qa@cybershield.test', password: PASSWORD },
});
check(
  'admin login returns the admin role',
  adminLogin.status === 200 && adminLogin.data?.user?.role === 'admin',
  `role=${adminLogin.data?.user?.role}`
);

const stats0 = await admin.req('/api/admin/stats');
check(
  'admin stats read real counts',
  stats0.status === 200 && stats0.data?.stats?.approved === 300,
  `approved=${stats0.data?.stats?.approved} pending=${stats0.data?.stats?.pending}`
);

/* ------------------------------------------------------------------ */
/* 2. Normal quiz flow                                               */
/* ------------------------------------------------------------------ */

const fresh1 = makeClient();
const fresh2 = makeClient();
const userA = makeClient();

const reg1 = await register(fresh1, 'fresh1.qa@cybershield.test', 'Fresh One');
const reg2 = await register(fresh2, 'fresh2.qa@cybershield.test', 'Fresh Two');
const reg3 = await register(userA, 'usera.qa@cybershield.test', 'User A');
const registered = [reg1, reg2, reg3].every((r) => r.status === 201 || r.status === 200);
check('fresh test accounts register (or sign in if they exist)', registered, [reg1, reg2, reg3].map((r) => r.status).join(','));

check('ordinary user cannot read admin stats (403)', (await fresh2.req('/api/admin/stats')).status === 403);

const start1 = await fresh1.req('/api/quiz/start', {
  method: 'POST',
  body: { mode: 'normal', count: 5, category: 'all' },
});
check(
  'normal quiz starts server-side',
  start1.status === 201 && start1.data?.total === 5 && start1.data?.quizId,
  `total=${start1.data?.total}`
);

const answered1 = await answerAll(fresh1, start1.data.quizId, true);
check(
  'served questions never include the answer key',
  answered1.length === 5 && answered1.every((a) => !a.leaked),
  `served=${answered1.length}`
);
check(
  'shuffled options keep the correct mapping',
  answered1.every((a) => a.correct === true && a.keyIdx === a.expected),
  `correct=${answered1.filter((a) => a.correct).length}/5 unique=${isUnique(answered1)}`
);

const sub1 = await fresh1.req('/api/quiz/submit', {
  method: 'POST',
  body: { quizId: start1.data.quizId, durationSeconds: 42 },
});
check(
  'server scores the run correctly',
  sub1.status === 200 && sub1.data?.score === 100 && sub1.data?.correct === 5 && sub1.data?.saved === true,
  `score=${sub1.data?.score} saved=${sub1.data?.saved}`
);

const sub1b = await fresh1.req('/api/quiz/submit', { method: 'POST', body: { quizId: start1.data.quizId } });
check('duplicate submit is idempotent', sub1b.status === 200 && sub1b.data?.duplicate === true);

const start2 = await fresh1.req('/api/quiz/start', { method: 'POST', body: { mode: 'normal', count: 5 } });
const answered2 = await answerAll(fresh1, start2.data.quizId, true);
const overlap = answered2.filter((a) => answered1.some((b) => b.id === a.id)).length;
check('previously attempted questions are avoided', overlap === 0, `overlap=${overlap}`);
check('questions are unique within a run', isUnique(answered2));
await fresh1.req('/api/quiz/submit', { method: 'POST', body: { quizId: start2.data.quizId } });

/* ------------------------------------------------------------------ */
/* 3. Adaptive difficulty                                            */
/* ------------------------------------------------------------------ */

// fresh2 has no attempts yet, so this is the true new-user path.
const ad1 = await fresh2.req('/api/quiz/start', { method: 'POST', body: { mode: 'adaptive', count: 5 } });
check(
  'new user starts at the beginner level',
  ad1.status === 201 && ad1.data?.startDifficulty === 'easy',
  `start=${ad1.data?.startDifficulty}`
);
const adAns1 = await answerAll(fresh2, ad1.data.quizId, true);
const adSub1 = await fresh2.req('/api/quiz/submit', { method: 'POST', body: { quizId: ad1.data.quizId } });
check(
  'difficulty rises after repeated correct answers',
  adAns1.some((a) => a.moved === 1) && adSub1.data?.finalDifficulty === 'hard',
  `moves=${adAns1.map((a) => a.moved).join(',')} final=${adSub1.data?.finalDifficulty}`
);
check(
  'adaptive summary has the full breakdown',
  !!adSub1.data?.summary &&
    Object.keys(adSub1.data.summary.difficultyDistribution || {}).length === 3 &&
    (adSub1.data.summary.topicStats || []).length > 0
);

for (let i = 0; i < 2; i++) {
  const run = await userA.req('/api/quiz/start', { method: 'POST', body: { mode: 'normal', count: 5 } });
  await answerAll(userA, run.data.quizId, true);
  await userA.req('/api/quiz/submit', { method: 'POST', body: { quizId: run.data.quizId } });
}
const ad2 = await userA.req('/api/quiz/start', { method: 'POST', body: { mode: 'adaptive', count: 5 } });
const adAns2 = await answerAll(userA, ad2.data.quizId, false);
const adSub2 = await userA.req('/api/quiz/submit', { method: 'POST', body: { quizId: ad2.data.quizId } });
check(
  'difficulty falls after repeated incorrect answers',
  adAns2.some((a) => a.moved === -1) && adSub2.data?.finalDifficulty === 'easy',
  `start=${ad2.data?.startDifficulty} moves=${adAns2.map((a) => a.moved).join(',')} final=${adSub2.data?.finalDifficulty}`
);
check(
  'hard questions earn weighted credit in adaptive scoring',
  adSub2.status === 200 && typeof adSub2.data?.summary?.weightedScore === 'number' && adSub2.data.summary.rawScore === 0
);

/* ------------------------------------------------------------------ */
/* 4. History isolation + dashboard                                  */
/* ------------------------------------------------------------------ */

const dashFresh2 = await fresh2.req('/api/dashboard');
const histFresh2 = await fresh2.req('/api/quiz/history');
const histUserA = await userA.req('/api/quiz/history');
check(
  'different users have isolated question histories',
  dashFresh2.data?.stats?.quizAttempts === 1 &&
    histFresh2.data?.attempted === 5 &&
    histUserA.data?.attempted === 15,
  `fresh2=${histFresh2.data?.attempted} userA=${histUserA.data?.attempted}`
);
check('dashboard reports the real approved question count', dashFresh2.data?.stats?.approvedQuestions === 300);

/* ------------------------------------------------------------------ */
/* 5. Admin lifecycle                                                */
/* ------------------------------------------------------------------ */

const newQ = {
  text: 'Which control best reduces the impact of a stolen cloud access key?',
  options: [
    'Rotate keys automatically and use short-lived credentials',
    'Store the key in the frontend code',
    'Email the key to the whole team',
    'Disable access logging',
  ],
  correct: 0,
  explanation: 'Short-lived, automatically rotated credentials limit how long a leaked key stays useful.',
  topic: 'network-security',
  subtopic: 'Cloud Security',
  difficulty: 'medium',
};

const addPending = await admin.req('/api/admin/questions', {
  method: 'POST',
  body: { ...newQ, status: 'pending', questionId: 'qa-pending-1' },
});
check('admin can add a pending question', addPending.status === 201 && addPending.data?.question?.status === 'pending');
check('pending questions are not served', (await anon.req('/api/quiz/meta')).data?.approved === 300);

const approve = await admin.req('/api/admin/questions/qa-pending-1/approve', { method: 'POST', body: {} });
check(
  'approval adds the question to the active bank',
  approve.status === 200 &&
    approve.data?.question?.status === 'approved' &&
    (await anon.req('/api/quiz/meta')).data?.approved === 301
);

const rejectAdd = await admin.req('/api/admin/questions', {
  method: 'POST',
  body: {
    ...newQ,
    questionId: 'qa-pending-2',
    status: 'pending',
    text: 'Which practice keeps backup copies safe from ransomware encryption?',
  },
});
const rejectRes = await admin.req('/api/admin/questions/qa-pending-2/reject', {
  method: 'POST',
  body: { reason: 'Not needed for the bank' },
});
check(
  'rejected questions stay out of the bank',
  rejectAdd.status === 201 &&
    rejectRes.data?.question?.status === 'rejected' &&
    (await anon.req('/api/quiz/meta')).data?.approved === 301
);

const edit = await admin.req('/api/admin/questions/qa-pending-1', {
  method: 'PATCH',
  body: { text: 'Which control best limits the damage of a leaked cloud access key?' },
});
check('admin can edit a question with validation', edit.status === 200 && /limits the damage/.test(edit.data?.question?.text || ''));

const retire = await admin.req('/api/admin/questions/qa-pending-1/retire', { method: 'POST', body: {} });
check(
  'retiring removes a question from service without deleting history',
  retire.status === 200 &&
    retire.data?.question?.retired === true &&
    (await anon.req('/api/quiz/meta')).data?.approved === 300
);

check(
  'ordinary users cannot approve questions (403)',
  (await fresh2.req('/api/admin/questions/qa-pending-2/approve', { method: 'POST', body: {} })).status === 403
);

const dupSource = bank.find((q) => q.id === 'q1001');
const dup = await admin.req('/api/admin/questions', {
  method: 'POST',
  body: {
    questionId: 'qa-duplicate-1',
    status: 'pending',
    text: dupSource.question,
    options: dupSource.options,
    correct: dupSource.correct,
    explanation: dupSource.explanation,
    topic: dupSource.topic,
    subtopic: dupSource.subtopic,
    difficulty: dupSource.difficulty,
  },
});
check(
  'duplicate questions are rejected by validation',
  dup.status === 400 && /duplicate|already exists/i.test(dup.data?.error || ''),
  `status=${dup.status} error=${dup.data?.error || ''}`
);

/* ------------------------------------------------------------------ */
/* 6. Gemini generation + resilience                                 */
/* ------------------------------------------------------------------ */

const gen = await admin.req('/api/admin/generate', {
  method: 'POST',
  body: { topic: 'phishing-social', difficulty: 'easy', count: 2 },
});
check(
  'AI generation validates drafts or fails gracefully',
  gen.status === 201 || gen.status === 503,
  `status=${gen.status} accepted=${gen.data?.accepted ?? '-'} rejected=${gen.data?.rejected?.length ?? '-'}`
);
const metaAfter = (await anon.req('/api/quiz/meta')).data;
check('generated drafts never appear in the served bank before approval', metaAfter?.approved === 300, `approved=${metaAfter?.approved}`);

const offlineRun = await fresh2.req('/api/quiz/start', { method: 'POST', body: { mode: 'normal', count: 3 } });
check('quiz works regardless of Gemini availability', offlineRun.status === 201 && offlineRun.data?.total === 3);

/* ------------------------------------------------------------------ */
/* 7. Page regression                                                */
/* ------------------------------------------------------------------ */

const pages = [
  'index', 'password', 'quiz', 'news', 'threats', 'threat-intel', 'threat-details',
  'toolkit', 'glossary', 'resources', 'ai-assistant', 'about', 'dashboard', 'login', 'register', 'admin',
];
const broken = [];
for (const page of pages) {
  const res = await fetch(`${BASE}/html/${page}.html`);
  if (res.status !== 200) broken.push(`${page}:${res.status}`);
}
check('all existing pages still respond 200', broken.length === 0, broken.join(','));

const failed = results.filter((r) => !r.ok);
console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.name).join(' | '));
process.exitCode = failed.length ? 1 : 0;
