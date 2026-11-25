"use strict";
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const FILE = path.join(root, "server", "routes", "ai.js");

const BS = "\u005c";
const R  = "\u0072";
const N  = "\u006e";
const S  = "\u0073";

const BSBSr = BS+BS+R;
const BSBSn = BS+BS+N;
const BSBSs = BS+BS+S;
const goodBase64 = "/^[A-Za-z0-9+/=" + BS + R + BS + N + "$/";
const goodSpace  = "/^[A-Za-z0-9+/=" + BS + S + "$/";
const goodControlStart = "[" + BS + "u0000";

const s = fs.readFileSync(FILE, "utf8");
const idx = s.indexOf("function validImage\u000a");
const j   = s.indexOf("function stripDataUrl\u000a");
if (idx < 0 || j < 0) { console.log("could not locate validImage / stripDataUrl"); process.exit(1); }
const head = s.slice(0, idx);
const body = s.slice(idx, j);
const tail = s.slice(j);

let t = body;
let c1 = 0, c2 = 0, c3 = 0;
if (t.indexOf(BSBSr) >= 0) { t = t.split(BSBSr).join(B+r); c1++; }
if (t.indexOf(BSBSn) >= 0) { t = t.split(BSBSn).join(B+n); c2++; }
if (t.indexOf(BSBSs) >= 0) { t = t.split(BSBSs).join(B+S); c3++; }

const out = head + t + tail;
fs.writeFileSync(FILE, out, "utf8");

const after = fs.readFileSync(FILE, "utf8");
console.log("c1(replace \\\\r->\\r):", c1, "c2(replace \\\\n->\\n):", c2, "c3(replace \\\\s->\\s):", c3);
console.log(
  "base64 regex bytes now:",
  after.indexOf(goodBase64) >= 0
    ? JSON.stringify(after.slice(after.indexOf(goodBase64), after.indexOf(goodBase64)+24))
    : "(missing)"
);
console.log(
  "space regex bytes now:",
  after.indexOf(goodSpace) >= 0
    ? JSON.stringify(after.slice(after.indexOf(goodSpace), after.indexOf(goodSpace)+20))
    : "(missing)"
);
console.log(
  "control regex bytes now:",
  after.indexOf(goodControlStart) >= 0
    ? JSON.stringify(after.slice(after.indexOf(goodControlStart), after.indexOf(goodControlStart)+44))
    : "(missing)"
);
console.log("double-backslash pairs remaining:", (after.match(new RegExp(BS+BS,"g"))||[]).length);

const { execSync } = require("child_process");
try {
  execSync("node --check server/routes/ai.js", { cwd: root, stdio: "pipe" });
  console.log("node --check: OK");
} catch (e) {
  console.error("node --check FAIL:", (e.stderr||e.message||"").toString().slice(0,300));
  process.exit(1);
}
