// Turns failing tests in Node's TAP output into GitHub error annotations, so
// they show on the pull request without opening the raw job log.
// Usage: node .github/scripts/annotate-test-failures.mjs <tap-output-file>
import { readFileSync } from "node:fs";

const lines = readFileSync(process.argv[2] ?? "task-output.txt", "utf8").split(/\r?\n/);
const escape = (value) =>
  value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
const property = (value) => escape(value).replaceAll(":", "%3A").replaceAll(",", "%2C");

let emitted = 0;
for (let index = 0; index < lines.length && emitted < 50; index += 1) {
  const match = /^(\s*)not ok \d+ - (.*)$/.exec(lines[index]);
  if (!match) continue;
  const [, indent, name] = match;
  let location;
  const error = [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (line.trim() === "..." && line.startsWith(`${indent}  `)) break;
    if (/^\s*(# Subtest|not ok|ok) /.test(line)) break;
    const located = /^\s*location: '(.+):(\d+):\d+'$/.exec(line);
    if (located) location = { file: located[1], line: located[2] };
    const inline = /^\s*error: '(.*)'$/.exec(line);
    if (inline) error.push(inline[1]);
    if (/^\s*error: \|-?$/.test(line)) {
      const depth = line.search(/\S/);
      for (let next = cursor + 1; next < lines.length && error.length < 6; next += 1) {
        if (lines[next].trim() && lines[next].search(/\S/) <= depth) break;
        error.push(lines[next].trim());
      }
    }
  }
  if (!error.length || error.join() === "test failed") {
    // A whole file failed (e.g. it could not load): its stderr precedes the
    // "# Subtest" line as TAP comments.
    const block = [];
    for (let back = index - 1; back >= 0 && /^# /.test(lines[back]); back -= 1) {
      if (!/^# Subtest: /.test(lines[back])) block.unshift(lines[back].slice(2));
    }
    const start = block.findIndex((line) => /^(\w*Error|AssertionError)\b/.test(line.trim()));
    const excerpt = (start >= 0 ? block.slice(start, start + 4) : block.filter((line) => !/^Node\.js v/.test(line)).slice(-4));
    if (excerpt.length) error.splice(0, error.length, ...excerpt);
  }
  const file = location?.file.replace(`${process.cwd()}/`, "").replace(/^file:\/\//, "");
  const where = file ? ` file=${property(file)},line=${location.line},` : " ";
  console.log(`::error${where}title=${property(`Failing test: ${name}`.slice(0, 200))}::${escape(error.join("\n") || name)}`);
  emitted += 1;
}
console.log(`${emitted} failing test annotation${emitted === 1 ? "" : "s"} emitted.`);
