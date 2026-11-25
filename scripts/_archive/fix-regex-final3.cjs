"use strict";
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const FILE = path.join(root, "server", "routes", "ai.js");
const BS = String.fromCharCode(92);

const s = fs.readFileSync(FILE, "utf8");
const i = s.indexOf("function validImage");
const j = s.indexOf("function stripDataUrl");
const head = s.slice(0, i);
const body = s.slice(i, j);
const tail = s.slice(j);

// The file currently has "\\\\r\\\\n" (4 backslashes -> 2 real backslashes each
// followed by a letter) inside the base64 regex. We want "\\r\\n" (2 backslashes
// total -> 1 real backslash followed by r, 1 real backslash followed by n).
// Replace ALL occurrences of the 4-char sequence "backslash backslash r" with
// "backslash r" and same for n and s. That converts \\\\r -> \\r and \\\\n -> \\n
// and \\\\s -> \\s. We do it ONLY inside the validImage+stripDataUrl body to avoid
// disturbing the rest of the file.
const BSBSr = BS + BS + "r";
const BSBSn = BS + BS + "n";
const BSBSs = BS + BS + "s";
const BSrN  = BS + "r" + BS + "n";
const BSr   = BS + "r";
const BSn   = BS + "n";
const BSs   = BS + "s";

let t = body;
let changed = 0;
if (t.includes(BSBSr)) { t = t.replaceAll(BSBSr, BSr); changed++; }
if (t.includes(BSBSn)) { t = t.replaceAll(BSBSn, BSn); changed++; }
if (t.includes(BSBSs)) { t = t.replaceAll(BSBSs, BSs); changed++; }

const out = head + t + tail;
fs.writeFileSync(FILE, out, "utf8");

const after = fs.readFileSync(FILE, "utf8");
const goodBase64 = "/^[A-Za-z0-9+/=" + BS + "r" + BS + "n" + "$/";
const goodSpace  = "/^[A-Za-z0-9+/=" + BS + "s" + "$/";
console.log(
  "base64 regex bytes now:",
  after.includes(goodBase64) ? JSON.stringify(after.slice(after.indexOf(goodBase64), after.indexOf(goodBase64)+24)) : "(missing)"
);
console.log(
  "space regex bytes now:",
  after.includes(goodSpace) ? JSON.stringify(after.slice(after.indexOf(goodSpace), after.indexOf(goodSpace)+20)) : "(missing)"
);
console.log(
  "control regex bytes now:",
  after.includes("[" + BS + "u0000") ? JSON.stringify(after.slice(after.indexOf("[" + BS + "u0000"), after.indexOf("[" + BS + "u0000")+44)) : "(missing)"
);
console.log("double-backslash pairs remaining:", (after.match(new RegExp(BS+BS, "g")) || []).length);

const { execSync } = require("child_process");
try {
  execSync("node --check server/routes/ai.js", { cwd: root, stdio: "pipe" });
  console.log("node --check: OK");
} catch (e) {
  console.error("node --check FAIL:", (e.stderr || e.message || "").toString().slice(0, 300));
  process.exit(1);
}
