"use strict";
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const file = path.join(root, "server", "routes", "ai.js");
const s = fs.readFileSync(file, "utf8");

// Undo double-backslashes that appeared inside regex literals.
// The broken file contains sequences like \\\\r\\\\n and \\\\s inside the
// regex /.../ that should be single \r\n and \s.
const fixed = s
  .replace(/\\\\r/g, String.fromCharCode(92, 114)) // -> \r
  .replace(/\\\\n/g, String.fromCharCode(92, 10))  // -> \n
  .replace(/\\\\s/g, String.fromCharCode(92, 115)) // -> \s
  .replace(/\\\\u0000/g, "\\u0000")
  .replace(/\\\\u0008/g, "\\u0008")
  .replace(/\\\\u000B/g, "\\u000B")
  .replace(/\\\\u000C/g, "\\u000C")
  .replace(/\\\\u000E/g, "\\u000E")
  .replace(/\\\\u001F/g, "\\u001F");

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
