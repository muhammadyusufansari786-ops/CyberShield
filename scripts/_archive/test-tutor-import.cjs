"use strict";
const path = require("path");
const fs = require("fs");
const root = process.cwd();
const filePath = path.resolve(path.join(root, "server", "routes", "tutor.js"));
const urlPath = path.toURL(filePath);  // node 20+ has path.toURL()
const { execSync } = require("child_process");
const cmd = `node --input-type=module -e "import * as m from '${urlPath}'; console.log('named exports:', Object.keys(m).join(', '));"`;
try {
  const out = execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["pipe","pipe","pipe"] });
  console.log(out);
} catch (e) {
  console.log("cmd failed, but file itself is:", fs.existsSync(filePath), "size:", fs.statSync(filePath).size);
  // Will it import if we run as ESM via a temp .mjs?
  const tmp = path.join(root, "scripts", "_tmp-import-test.mjs");
  fs.writeFileSync(tmp, `import * as m from '${urlPath}'; console.log('exports:', Object.keys(m).join(', '));`);
  try {
    const out2 = execSync(`node '${tmp}'`, { cwd: root, encoding: "utf8", stdio: ["pipe","pipe","pipe"] });
    console.log(out2);
  } catch (e2) {
    console.log("tmp import failed:", (e2.stderr||e2.message).toString().slice(0,300));
  } finally {
    fs.unlinkSync(tmp);
  }
}
