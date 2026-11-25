"use strict";
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const FILE = path.join(root, "server", "routes", "ai.js");
const BS = String.fromCharCode(92);

const s = fs.readFileSync(FILE, "utf8");
const bodyStart = s.indexOf("function validImage");
const bodyEnd   = s.indexOf("function stripDataUrl", bodyStart + 10);
if (bodyStart < 0 || bodyEnd < 0) { console.log("locate failed"); process.exit(1); }

const head = s.slice(0, bodyStart - 1);
const body = s.slice(bodyStart - 1, bodyEnd); // include leading space
const tail = s.slice(bodyEnd);

function chr(n){ return String.fromCharCode(n); }
const BSrN = chr(92)+chr(114)+chr(92)+chr(110);   // backslash r backslash n
const BSr   = chr(92)+chr(114);
const BSn   = chr(92)+chr(110);
const BSs   = chr(92)+chr(115);

// The body currently has BSrN (backslash r backslash n) INSIDE the regex.
// That's correct already! The test is failing for another reason.
// Let's confirm and find the real issue:
console.log("body contains BSrN:", body.indexOf(BSrN) >= 0);
console.log("body contains BSBSr+BSBSn:", body.indexOf(chr(92)+chr(92)+chr(114)+chr(92)+chr(92)+chr(110)) >= 0);

// Reconstruct the expected good base64 regex bytes and see if they match
// what's actually in the file:
const goodBase64 = "/^[A-Za-z0-9+/=" + BSrN + "$/";
console.log("goodBase64 literal:", JSON.stringify(goodBase64));
console.log("body includes goodBase64?:", body.indexOf(goodBase64) >= 0);

// Extract what's actually there:
const i = body.indexOf("/^[A-Za-z0-9+/=");
const seg = body.slice(i, i + 22);
console.log("actual segment:", JSON.stringify(seg));
console.log("segment char codes:", Array.from(seg).map(c => c.charCodeAt(0)).join(","));

// The test:
const { execSync } = require("child_process");
try {
  execSync("node --check server/routes/ai.js", { cwd: root, stdio: "pipe" });
  console.log("node --check: OK");
} catch (e) {
  console.error("node --check FAIL:", (e.stderr||e.message||"").toString().slice(0,300));
  process.exit(1);
}
