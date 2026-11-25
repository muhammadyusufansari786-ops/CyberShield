"use strict";
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const FILE = path.join(root, "server", "routes", "ai.js");
const BS = String.fromCharCode(92);

const s = fs.readFileSync(FILE, "utf8");
const idx = s.indexOf("function validImage");
const len = s.indexOf("function stripDataUrl") - idx;
const head = s.slice(0, idx);
const body = s.slice(idx, idx + len);
const tail = s.slice(idx + len);

function ch(...c) { return String.fromCharCode.apply(null, c); }
const BSBSr = ch(92,92,114);
const BSBSn = ch(92,92,110);
const BSBSs = ch(92,92,115);
const BSBSu0 = ch(92,92,117,48,48,48,48);
const BSBSu8 = ch(92,92,117,48,48,48,56);
const BSBSuB = ch(92,92,117,48,48,48,66);
const BSBSuC = ch(92,92,117,48,48,48,67);
const BSBSuE = ch(92,92,117,48,48,48,69);
const BSBSu1F = ch(92,92,117,48,48,49,70);
const BSr = ch(92,114);
const BSn = ch(92,110);
const BSs = ch(92,115);
const BSun = ch(92,117,48,48,48,48);
const BSu8 = ch(92,117,48,48,48,56);
const BSBuB = ch(92,117,48,48,48,66);
const BSuC = ch(92,117,48,48,48,67);
const BSuE = ch(92,117,48,48,48,69);
const BSunF = ch(92,117,48,48,49,70);

const fixedBody = body
  .replaceAll(BSBSr, BSr)
  .replaceAll(BSBSn, BSn)
  .replaceAll(BSBSs, BSs)
  .replaceAll(BSBSu0, BSun)
  .replaceAll(BSBSu8, BSu8)
  .replaceAll(BSBSuB, BSBuB)
  .replaceAll(BSBSuC, BSuC)
  .replaceAll(BSBSuE, BSuE)
  .replaceAll(BSBSu1F, BSunF);

const t = head + fixedBody + tail;
fs.writeFileSync(FILE, t, "utf8");

const after = fs.readFileSync(FILE, "utf8");
const base64Marker = "/^[A-Za-z0-9+/=" + BSr + BSn + "$/";
const spaceMarker = "/^[A-Za-z0-9+/=" + BSs + "$/";
const controlMarker = "[" + BSun + "-" + BSu8 + BSBuB + BSuC + BSuE + "-" + BSunF + "]";
console.log(
  "base64 regex bytes now:",
  after.includes(base64Marker) ? JSON.stringify(after.slice(after.indexOf(base64Marker), after.indexOf(base64Marker)+24)) : "(missing)"
);
console.log(
  "space regex bytes now:",
  after.includes(spaceMarker) ? JSON.stringify(after.slice(after.indexOf(spaceMarker), after.indexOf(spaceMarker)+20)) : "(missing)"
);
console.log(
  "control regex bytes now:",
  after.includes(controlMarker) ? JSON.stringify(after.slice(after.indexOf(controlMarker), after.indexOf(controlMarker)+44)) : "(missing)"
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
