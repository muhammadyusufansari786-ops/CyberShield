"use strict";
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const FILE = path.join(root, "server", "routes", "ai.js");
const BS = String.fromCharCode(92);

const s = fs.readFileSync(FILE, "utf8");
let t = s.replaceAll(BS + BS + "r", BS + "r")
  .replaceAll(BS + BS + "n", BS + "n")
  .replaceAll(BS + BS + "s", BS + "s")
  .replaceAll(BS + BS + "u0000", BS + "u0000")
  .replaceAll(BS + BS + "u0008", BS + "u0008")
  .replaceAll(BS + BS + "u000B", BS + "u000B")
  .replaceAll(BS + BS + "u000C", BS + "u000C")
  .replaceAll(BS + BS + "u000E", BS + "u000E")
  .replaceAll(BS + BS + "u001F", BS + "u001F");

const base64Need = "/^[A-Za-z0-9+/=" + BS + "r" + BS + "n" + "$/";
const spaceNeed = "/^[A-Za-z0-9+/=" + BS + "s" + "$/";
const controlNeed = "[" + BS + "u0000-" + BS + "u0008" + BS + "u000B" + BS + "u000C" + BS + "u000E-" + BS + "u001F" + "]";
const base64Have = "/^[A-Za-z0-9+/=" + BS + BS + "r" + BS + BS + "n" + "$/";
const spaceHave = "/^[A-Za-z0-9+/=" + BS + BS + "s" + "$/";
const controlHave = "[" + BS + BS + "u0000-" + BS + BS + "u0008" + BS + BS + "u000B" + BS + BS + "u000C" + BS + BS + "u000E-" + BS + BS + "u001F" + "]";

if (t.includes(base64Have) && !t.includes(base64Need)) t = t.replaceAll(base64Have, base64Need), console.log("restored base64 alnum regex");
else if (!t.includes(base64Need)) console.log("WARNING: base64 alnum regex not in either form");
if (t.includes(spaceHave) && !t.includes(spaceNeed)) t = t.replaceAll(spaceHave, spaceNeed), console.log("restored space regex");
else if (!t.includes(spaceNeed)) console.log("WARNING: space regex not in either form");
if (t.includes(controlHave) && !t.includes(controlNeed)) t = t.replaceAll(controlHave, controlNeed), console.log("restored control regex");
else if (!t.includes(controlNeed)) console.log("WARNING: control regex not in either form");

fs.writeFileSync(FILE, t, "utf8");
console.log("double-backslash pairs now:", (t.match(new RegExp(BS + BS, "g")) || []).length);
const { execSync } = require("child_process");
try {
  execSync("node --check server/routes/ai.js", { cwd: root, stdio: "pipe" });
  console.log("node --check: OK");
} catch (e) {
  console.error("node --check FAIL:", (e.stderr || e.message || "").toString().slice(0, 300));
  process.exit(1);
}
