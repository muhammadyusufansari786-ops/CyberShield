"use strict";
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const FILE = path.join(root, "server", "routes", "ai.js");

const BS = String.fromCharCode(92);

const s = fs.readFileSync(FILE, "utf8");
const dbl = s.match(new RegExp(BS + BS, "g"));
if (dbl && dbl.length) {
  console.log("found", dbl.length, "double-backslash sequences, undoing...");
  let t = s;
  t = t.replace(new RegExp(BS + BS + "r", "g"), BS + "r");
  t = t.replace(new RegExp(BS + BS + "n", "g"), BS + "n");
  t = t.replace(new RegExp(BS + BS + "s", "g"), BS + "s");
  t = t.replace(new RegExp(BS + BS + "u0000", "g"), BS + "u0000");
  t = t.replace(new RegExp(BS + BS + "u0008", "g"), BS + "u0008");
  t = t.replace(new RegExp(BS + BS + "u000B", "g"), BS + "u000B");
  t = t.replace(new RegExp(BS + BS + "u000C", "g"), BS + "u000C");
  t = t.replace(new RegExp(BS + BS + "u000E", "g"), BS + "u000E");
  t = t.replace(new RegExp(BS + BS + "u001F", "g"), BS + "u001F");
  fs.writeFileSync(FILE, t, "utf8");
  console.log("written; double-backslash pairs now:", (t.match(new RegExp(BS + BS, "g")) || []).length);
} else {
  console.log("no double-backslash sequences found.");
}

const after = fs.readFileSync(FILE, "utf8");
const base64Marker = "/^[A-Za-z0-9+/=" + BS + "r" + BS + "n" + "$/";
const spaceMarker = "/^[A-Za-z0-9+/=" + BS + "s" + "$/";
const bIdx = after.indexOf(base64Marker);
const sIdx = after.indexOf(spaceMarker);
console.log("base64 regex present:", bIdx >= 0, bIdx >= 0 ? "| bytes:" + JSON.stringify(after.slice(bIdx, bIdx + 24)) : "");
console.log("space regex present :", sIdx >= 0, sIdx >= 0 ? "| bytes:" + JSON.stringify(after.slice(sIdx, sIdx + 20)) : "");

const { execSync } = require("child_process");
try {
  execSync("node --check server/routes/ai.js", { cwd: root, stdio: "pipe" });
  console.log("node --check: OK");
} catch (e) {
  console.error("node --check FAIL:", (e.stderr || e.message || "").toString().slice(0, 300));
  process.exit(1);
}
