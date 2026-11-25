"use strict";
const http = require("http");
const jar = new Map();
function setCookie(res) {
  const setCookie = res.headers["set-cookie"];
  if (!setCookie) return;
  for (const c of (Array.isArray(setCookie) ? setCookie : [setCookie])) {
    const m = c.match(/^([^=;]+)=([^;]+)/);
    if (m) jar.set(m[1], decodeURIComponent(m[2]));
  }
}
function req(method, path, body, extraHeaders) {
  return new Promise((resolve) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    for (const [k, v] of jar) headers.Cookie = (headers.Cookie ? headers.Cookie + "; " : "") + k + "=" + v;
    if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) headers[k] = v;
    const o = { hostname: "localhost", port: 3000, path, method, headers };
    const r = http.request(o, (res) => {
      setCookie(res);
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, raw: d, headers: res.headers }));
    });
    r.on("error", (e) => resolve({ status: 0, error: e.message }));
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}
function json(r) { try { return JSON.parse(r.raw); } catch { return null; } }

async function main() {
  console.log("== tutor flow with real login ==");

  const name = "tutorqa-" + Date.now().toString(36);
  const email = name + "@cybershield.test";
  const pass = "Test$Pass2026x";

  const reg = await req("POST", "/api/auth/register", { name, email, password: pass, confirmPassword: pass });
  console.log("1 register:", reg.status, json(reg)?.user?.email || json(reg)?.error || reg.raw.slice(0, 80));

  const login = await req("POST", "/api/auth/login", { email, password: pass });
  console.log("2 login:", login.status, json(login)?.user?.email || json(login)?.error || login.raw.slice(0, 80));

  const conv = await req("GET", "/api/tutor/conversation");
  const c = json(conv);
  console.log("3 GET /api/tutor/conversation:", conv.status,
    c?.conversation ? "id=" + c.conversation.id + " msgs=" + c.conversation.messages.length : (c?.error || conv.raw.slice(0, 80)));
  if (c?.suggestedPrompts) console.log("   suggestedPrompts:", c.suggestedPrompts.length);

  const ask = await req("POST", "/api/ai/tutor", { message: "What is phishing?", difficulty: "beginner" });
  const a = json(ask);
  console.log("4 POST /api/ai/tutor:", ask.status,
    a ? "reply=" + String(a.reply||"").slice(0, 40) + "… gen=" + a.generatedBy + " safety=" + a.safety + " takeaways=" + (a.keyTakeaways||[]).length + " followUps=" + (a.followUps||[]).length : ask.raw.slice(0, 80));

  const conv2 = await req("GET", "/api/tutor/conversation");
  const c2 = json(conv2);
  console.log("5 GET /api/tutor/conversation after ask:", conv2.status,
    c2?.conversation ? "msgs=" + c2.conversation.messages.length + " lastTopic=" + (c2.conversation.messages[c2.conversation.messages.length-1]?.topic||"-") : (c2?.error || conv2.raw.slice(0, 80)));

  const follow = await req("POST", "/api/ai/tutor", { message: "How do I spot it?", difficulty: "beginner" });
  const f = json(follow);
  console.log("6 POST follow-up:", follow.status,
    f ? "reply=" + String(f.reply||"").slice(0, 40) + "… gen=" + f.generatedBy : follow.raw.slice(0, 80));

  const del = await req("DELETE", "/api/tutor/conversation");
  console.log("7 DELETE /api/tutor/conversation:", del.status, json(del)?.ok || del.raw.slice(0, 80));

  const conv3 = await req("GET", "/api/tutor/conversation");
  const c3 = json(conv3);
  console.log("8 GET after clear:", conv3.status,
    c3?.conversation ? "msgs=" + c3.conversation.messages.length : (c3?.error || conv3.raw.slice(0, 80)));

  const fresh = await req("POST", "/api/tutor/conversation");
  const fr = json(fresh);
  console.log("9 POST /api/tutor/conversation (fresh):", fresh.status,
    fr?.conversation ? "title=" + fr.conversation.title + " msgs=" + fr.conversation.messages.length : (fr?.error || fresh.raw.slice(0, 80)));

  console.log("\n== tutor flow complete ==");
}

main().catch(e => { console.error(e); process.exit(1); });
