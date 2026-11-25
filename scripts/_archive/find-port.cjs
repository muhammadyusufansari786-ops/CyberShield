"use strict";
const { execSync } = require("child_process");
const PORT = parseInt(process.argv[2] || "3000", 10);
const out = execSync(
  `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess)"`,
  { encoding: "utf8" }
).trim();
const pids = out
  .split(/\r?\n/)
  .filter(Boolean)
  .map((p) => parseInt(p, 10))
  .filter((p) => !isNaN(p));
console.log(`Port ${PORT} listening PIDs:`, pids.length ? pids : "none");
if (pids.length) {
  console.log(execSync(`tasklist /FI "PID eq ${pids[0]}" /NH`, { encoding: "utf8" }).trim());
}
