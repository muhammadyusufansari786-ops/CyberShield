"use strict";
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const file = path.join(root, "server", "routes", "ai.js");
const s = fs.readFileSync(file, "utf8");
const NEWLINE = String.fromCharCode(10);
// The broken file currently stores every line break as the two literal
// characters backslash + n. Replace every literal "\n" with a real newline.
const fixed = s.split("\\n").join(NEWLINE);
fs.writeFileSync(file, fixed, "utf8");
console.log("rewrote", fixed.length, "bytes; real newlines:", (fixed.match(/\n/g) || []).length);
const { execSync } = require("child_process");
try {
  execSync("node --check server/routes/ai.js", { cwd: root, stdio: "pipe" });
  console.log("CHECK_OK");
} catch (e) {
  console.error("FAIL:", (e.stderr || e.message || "").toString().slice(0, 400));
  process.exit(1);
}
