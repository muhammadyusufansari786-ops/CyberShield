"use strict";
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const FILE = path.join(root, "server", "routes", "ai.js");

const BS  = "\u005c";
const BSBS = "\u005c\u005c";
const R  = "\u0072";
const N  = "\u006e";
const S  = "\u0073";

const s = fs.readFileSync(FILE, "utf8");
const idx = s.indexOf("function validImage");
const j   = s.indexOf("function stripDataUrl");
if (idx < 0 || j < 0) { console.log("locate failed"); process.exit(1); }
const head = s.slice(0, idx - 1);
const body = s.slice(idx - 1, j);
const tail = s.slice(j);

const badBase64 = "/^[A-Za-z0-9+/=" + BSBS + R + BSBS + N + "]";
const goodBase64 = "/^[A-Za-z0-9+/=" + BS + R + BS + N + "]";
const badSpace = "/^[A-Za-z0-9+/=" + BSBS + S + "]";
const goodSpace  = "/^[A-Za-z0-9+/=" + BS + S + "]";

console.log("body contains badBase64?:", body.includes(badBase64));
console.log("body contains badSpace?:", body.includes(badSpace));

let t = body;
let c1=0, c2=0;
if (t.indexOf(badBase64) >= 0) { t = t.split(badBase64).join(goodBase64); c1=1; console.log("fixed base64"); }
if (t.indexOf(badSpace) >= 0)  { t = t.split(badSpace).join(goodSpace);  c2=1; console.log("fixed space"); }

const out = head + t + tail;
fs.writeFileSync(FILE, out, "utf8");

const after = fs.readFileSync(FILE, "utf8");
const gBS = "/^[A-Za-z0-9+/=" + BS + R + BS + N + "]";
const gSS = "/^[A-Za-z0-9+/=" + BS + S + "]";
console.log("base64 regex bytes now:", after.indexOf(gBS)>=0 ? JSON.stringify(after.slice(after.indexOf(gBS), after.indexOf(gBS)+22)) : "(missing)");
console.log("space regex bytes now:", after.indexOf(gSS)>=0 ? JSON.stringify(after.slice(after.indexOf(gSS), after.indexOf(gSS)+18)) : "(missing)");
console.log("double-backslash pairs remaining:", (after.match(new RegExp(BS+BS,"g"))||[]).length);

const { execSync } = require("child_process");
try {
  execSync("node --check server/routes/ai.js", { cwd: root, stdio: "pipe" });
  console.log("node --check: OK");
} catch (e) {
  console.error("node --check FAIL:", (e.stderr||e.message||"").toString().slice(0,300));
  process.exit(1);
}
