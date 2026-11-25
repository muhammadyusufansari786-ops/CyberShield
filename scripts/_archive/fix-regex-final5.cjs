"use strict";
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const FILE = path.join(root, "server", "routes", "ai.js");

const BS  = String.fromCharCode(92);
const BSBS = String.fromCharCode(92,92);
const R  = String.fromCharCode(114);
const N  = String.fromCharCode(110);
const S  = String.fromCharCode(115);

const s = fs.readFileSync(FILE, "utf8");
const idx = s.indexOf("function validImage");
const j   = s.indexOf("function stripDataUrl", idx + 10);
if (idx < 0 || j < 0) { console.log("locate failed"); process.exit(1); }

const head = s.slice(0, idx - 1);
const body = s.slice(idx - 1, j);
const tail = s.slice(j);

// The body still contains the 4-char sequence backslash+backslash+r and
// backslash+backslash+n inside the base64 regex. Replace each 2-backslash
// pair + letter with 1-backslash + letter, across the whole body.
let t = body;
let fixed = 0;

function replacePair(twoBackSlashLetter, oneBackSlashLetter) {
  const delta = (t.match(new RegExp(BSBS + oneBackSlashLetter,"g")) || []).length;
  if (delta > 0) {
    t = t.split(BSBS + oneBackSlashLetter).join(BS + oneBackSlashLetter);
    fixed += delta;
    console.log("replaced", BSBS + oneBackSlashLetter, "->", BS + oneBackSlashLetter, "x", delta);
  }
  return delta;
}

replacePair(BSBS + R, BS + R);
replacePair(BSBS + N, BS + N);
replacePair(BSBS + S, BS + S);

const out = head + t + tail;
fs.writeFileSync(FILE, out, "utf8");

const after = fs.readFileSync(FILE, "utf8");
const base64Marker = "/^[A-Za-z0-9+/=" + BS + R + BS + N + "$/";
const spaceMarker  = "/^[A-Za-z0-9+/=" + BS + S + "$/";
console.log(
  "base64 regex bytes now:",
  after.indexOf(base64Marker) >= 0
    ? JSON.stringify(after.slice(after.indexOf(base64Marker), after.indexOf(base64Marker)+22))
    : "(missing)"
);
console.log(
  "space regex bytes now:",
  after.indexOf(spaceMarker) >= 0
    ? JSON.stringify(after.slice(after.indexOf(spaceMarker), after.indexOf(spaceMarker)+18))
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
