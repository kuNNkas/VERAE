import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "frontend", "src");
const TARGET_EXT = new Set([".ts", ".tsx"]);

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full));
    else if (TARGET_EXT.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

test("frontend does not log auth token to UI console", () => {
  const files = collectFiles(ROOT);
  const offenders = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const hasToken = /access_token|Authorization|Bearer|verae_token|token/i.test(content);
    const hasConsole = /console\.(log|debug|info|warn|error)\s*\(/.test(content);
    if (hasToken && hasConsole) {
      offenders.push(path.relative(process.cwd(), file));
    }
  }

  assert.deepEqual(offenders, []);
});
