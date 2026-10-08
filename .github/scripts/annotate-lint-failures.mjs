// Turns ESLint's stylish output into GitHub annotations, including problems
// without a rule id (parse errors, unused disable directives) that the stock
// problem matcher drops.
import { readFileSync } from "node:fs";

const lines = readFileSync(process.argv[2] ?? "task-output.txt", "utf8").split("\n");
let file = "";
let count = 0;
for (const line of lines) {
  if (/^\/\S/.test(line)) { file = line.trim().replace(`${process.cwd()}/`, ""); continue; }
  const match = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.*)$/.exec(line);
  if (!match || !file) continue;
  const [, row, column, level, message] = match;
  console.log(`::${level === "error" ? "error" : "warning"} file=${file},line=${row},col=${column}::${message.trim()}`);
  if (++count >= 50) break;
}
if (!count) console.log(`::error::Lint failed without per-file problems:%0A${lines.slice(-40).join("%0A")}`);
