"use strict";
const http = require("http");
const jar = new Map();
function cook(res) {
  const sc = res.headers["set-cookie"];
  if (!sc) return;
  for (const c of (Array.isArray(sc) ? sc : [sc])) {
    const m = c.match(/^([^=;]+)=([^;]+)/);
    if (m) jar.set(m[1], decodeURIComponent(m[2]));
  }
}
function req(method, path, body) {
  return new Promise((resolve) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    for (const [k, v] of jar) headers.Cookie = (headers.Cookie ? headers.Cookie + "; " : "") + k + "=" + v;
    const o = { hostname: "localhost", port: 3000, path, method, headers };
    const r = http.request(o, (res) => {
      cook(res);
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, raw: d }));
    });
    r.on("error", (e) => resolve({ status: 0, error: e.message }));
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}
function J(r) { try { return JSON.parse(r.raw); } catch { return null; } }

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("== tutor full integration test ==");
  const name = "full-" + Date.now().toString(36);
  const email = name + "@cybershield.test";
  const pass = "Full$Pass2026x";

  const reg = await req("POST", "/api/auth/register", { name, email, password: pass, confirmPassword: pass });
  console.log("1 register:", reg.status);
  const login = await req("POST", "/api/auth/login", { email, password: pass });
  console.log("2 login:", login.status);

  // GET conversation (no history yet)
  const c0 = J(await req("GET", "/api/tutor/conversation"));
  console.log("3 GET conversation (no history):",
    "msgs=", c0?.conversation?.messages?.length,
    "suggestedPrompts=", (c0?.suggestedPrompts||[]).length,
    "personalization.attempts=", c0?.personalization?.attempts,
    "personalization.hasHistory=", c0?.personalization?.hasHistory,
    "personalization.weakTopics=", (c0?.personalization?.weakTopics||[]).length,
    "personalization.recommendedLevel=", c0?.personalization?.recommendedLevel);

  // Take a few real phishing-quiz attempts to create weak-topic data, then check personalization
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    const start = await req("POST", "/api/quiz/start", { mode: "normal", count: 5, category: "phishing-social" });
    const sid = J(start)?.quizId;
    if (!sid) { console.log("   quiz start failed at", i, J(start)?.error || start.raw.slice(0,60)); continue; }
    for (let q = 0; q < 5; q++) {
      const nxt = await req("POST", "/api/quiz/next", { quizId: sid });
      const qd = J(nxt)?.question;
      if (!qd) break;
      const doc = await (async () => {
        // fetch the question from /api/quiz/questions?quizId s? - we dont have that; instead use /api/quiz/next already gave us the question with options + correct?
        // Actually /api/quiz/next returns question with { id, text, options, difficulty } but NOT correct index.
        // To answer we need the correct index from the DB. We'll fetch via the question bank by questionId.
        return null;
      })();
      // We can't easily get correct index without DB access in this script; skip auto-answering.
    }
    await req("POST", "/api/quiz/submit", { quizId: sid, durationSeconds: 60 });
  }
  console.log("   took", attempts, "phishing quiz starts (answers skipped - needs DB lookup)");

  // Instead, use the adaptive quiz submit path which DOES record attempts - but we need correct answers.
  // Easiest: query the question bank via the server's /api/quiz/questions endpoint (if it exists) or
  // just submit wrong answers to create weak data. Let's try submitting with deliberately wrong answers.

  // Re-take a quiz and answer WRONG to generate weak phishing data
  const start2 = await req("POST", "/api/quiz/start", { mode: "normal", count: 4, category: "password-security" });
  const sid2 = J(start2)?.quizId;
  console.log("4 quiz start (password, wrong answers):", start2.status, sid2 ? "quizId=" + sid2 : J(start2)?.error);
  if (sid2) {
    for (let q = 0; q < 4; q++) {
      const nxt = await req("POST", "/api/quiz/next", { quizId: sid2 });
      const qd = J(nxt)?.question;
      if (!qd) break;
      // pick wrong answer: select (correctIndex + 1) % 4, but we don't know correctIndex.
      // The question object from /api/quiz/next typically includes { id, text, options, difficulty } - no correct.
      // We'll just answer index 0 for all (likely wrong for most). This generates weak-ish data.
      await req("POST", "/api/quiz/answer", { quizId: sid2, questionId: qd.id, selectedIndex: 0 });
    }
    const sub = await req("POST", "/api/quiz/submit", { quizId: sid2, durationSeconds: 60 });
    console.log("   submit:", sub.status, "saved=", J(sub)?.saved, "score=", J(sub)?.summary?.score, "correct=", J(sub)?.correct);
  }

  // Now check personalization again
  const c1 = J(await req("GET", "/api/tutor/conversation"));
  console.log("5 GET conversation (after quiz attempts):",
    "msgs=", c1?.conversation?.messages?.length,
    "personalization.attempts=", c1?.personalization?.attempts,
    "personalization.hasHistory=", c1?.personalization?.hasHistory,
    "personalization.answeredQuestions=", c1?.personalization?.answeredQuestions,
    "personalization.weakTopics=", (c1?.personalization?.weakTopics||[]).length,
    "personalization.weakTopics=", JSON.stringify(c1?.personalization?.weakTopics?.slice(0,3)),
    "personalization.recommendedLevel=", c1?.personalization?.recommendedLevel);

  // Ask a question that should connect to weak topic (password-security)
  const q = await req("POST", "/api/ai/tutor", { message: "How can I make my passwords stronger?", difficulty: "intermediate" });
  const a = J(q);
  console.log("6 ask password question:",
    "status=", q.status,
    "gen=", a?.generatedBy,
    "topic=", a?.topic, "topicLabel=", a?.topicLabel,
    "hasNotice=", !!a?.notice,
    "takeaways=", (a?.keyTakeaways||[]).length,
    "followUps=", (a?.followUps||[]).length,
    "practice=", a?.practice,
    "replyLen=", String(a?.reply||"").length,
    "reply starts:", String(a?.reply||"").slice(0, 60));

  // Follow-up within the same conversation (context)
  const f = await req("POST", "/api/ai/tutor", { message: "Is a password manager safe?", difficulty: "beginner" });
  const b = J(f);
  console.log("7 follow-up (password manager):",
    "status=", f.status,
    "gen=", b?.generatedBy,
    "reply starts:", String(b?.reply||"").slice(0, 60));

  // Conversation now has 3 asks = 6 messages
  const c2 = J(await req("GET", "/api/tutor/conversation"));
  console.log("8 GET conversation: msgs=", c2?.conversation?.messages?.length,
    "difficulty=", c2?.conversation?.difficulty,
    "lastTopic=", c2?.conversation?.messages?.slice(-1)[0]?.topic);

  // Clear and verify empty
  const d = await req("DELETE", "/api/tutor/conversation");
  console.log("9 DELETE:", d.status, J(d)?.ok);
  const c3 = J(await req("GET", "/api/tutor/conversation"));
  console.log("10 GET after clear: msgs=", c3?.conversation?.messages?.length, "title=", c3?.conversation?.title);

  const fresh = J(await req("POST", "/api/tutor/conversation"));
  console.log("11 POST fresh: status=", fresh.status, "title=", fresh?.conversation?.title, "msgs=", fresh?.conversation?.messages?.length);

  console.log("\n== integration test complete ==");
}
main().catch(e => { console.error(e); process.exit(1); });
