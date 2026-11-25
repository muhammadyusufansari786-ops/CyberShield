"use strict";
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const FILE = path.join(root, "server", "routes", "ai.js");
const s = fs.readFileSync(FILE, "utf8");

const BS = String.fromCharCode(92);

console.log("=== file content sanity ===");
console.log("real newlines:", (s.match(/\n/g) || []).length);
console.log("double-backslash pairs (expected 0 after fix):", (s.match(/\\/g) || []).length);
console.log("has '/scam-analyze' route:", s.includes("'/scam-analyze'"));
console.log("has '/tutor' route:", s.includes("'/tutor'"));
console.log("has '/learning-path' route:", s.includes("'/learning-path'"));
console.log("has '/news-explain' route:", s.includes("'/news-explain'"));
console.log("exports router default:", s.includes("export default router;"));

console.log("=== regex byte checks ===");
const base64i = s.indexOf("/^[A-Za-z0-9+/=" + BS + "r" + BS + "n" + "$/");
console.log("base64 regex literal present (with ONE backslash before r,n):", base64i >= 0);
if (base64i >= 0) console.log("  bytes:", JSON.stringify(s.slice(base64i, base64i + 24)));
const spacei = s.indexOf("/^[A-Za-z0-9+/=" + BS + "s" + "$/");
console.log("space regex literal present (with ONE backslash before s):", spacei >= 0);
if (spacei >= 0) console.log("  bytes:", JSON.stringify(s.slice(spacei, spacei + 20)));

console.log("=== extract validImage body and eval it ===");
const body = s.slice(s.indexOf("function validImage"), s.indexOf("function stripDataUrl"));
const fn = new Function("return (" + body + ")")();
try {
  const v = fn();
  console.log("validImage compiles: OK");
  console.log("  image/png, Qk3g ->", v("image/png", "Qk3g"), "(expect true)");
  console.log("  image/png, not base64 ->", v("image/png", "!!!"), "(expect false)");
  console.log("  bad mime ->", v("image/foobar", "Qk3g"), "(expect false)");
} catch (e) {
  console.log("validImage eval FAIL:", e.message.slice(0, 200));
}

console.log("=== import symbols sanity ===");
console.log("imports tutorAnswer:", s.includes("  tutorAnswer,"));
console.log("imports buildFallbackReply:", s.includes("  buildFallbackReply,"));

console.log("=== syntax check ===");
const { execSync } = require("child_process");
try {
  execSync("node --check server/routes/ai.js", { cwd: root, stdio: "pipe" });
  console.log("node --check: OK");
} catch (e) {
  console.log("node --check FAIL:", (e.stderr || e.message || "").toString().slice(0, 300));
}
