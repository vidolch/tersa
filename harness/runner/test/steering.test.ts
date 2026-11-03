import assert from "node:assert/strict";
import { test } from "node:test";
import { classify } from "../src/steering.ts";

const bash = (command: string) => classify("Bash", { command });

test("code-reading shell commands are redirected", () => {
  for (const c of [
    "grep -rn 'carryover' packages/loot-core/src/server/budget",
    "cd packages/loot-core && grep -rn doesNotContain src",
    "rg -n rankRules packages",
    "sed -n '40,80p' packages/loot-core/src/server/budget/envelope.ts",
    "cat packages/loot-core/src/server/rules/rule-utils.ts | head -120",
    "head -50 src/server/api.ts",
    "find packages/loot-core/src -name '*.ts' | xargs grep -l startsWith",
    "find . -name 'occurrences.ts'",
  ]) assert.equal(bash(c).deny, true, c);
});

test("tests, builds, git and non-code files are allowed", () => {
  for (const c of [
    "yarn workspace @actual-app/core run test:node src/server/rules",
    "node .yarn/releases/yarn-4.17.1.cjs vitest --run src/server/budget",
    "npx tsc --noEmit -p packages/loot-core",
    "git diff",
    "git status",
    "cat package.json",
    "cat AGENTS.md | head -40",
    "ls packages/loot-core/src/server",
    "grep -n version package.json",
    "tail -50 /tmp/test.log",
    "node -e \"console.log(1)\"",
  ]) assert.equal(bash(c).deny, false, c);
});

test("suggestions carry the agent's own pattern and path", () => {
  const r = bash("grep -rn 'last-month-overspent' packages/loot-core/src");
  assert.match(r.reason!, /code_find \{"patterns":\["last-month-overspent"\],"paths":\["packages\/loot-core\/src"\]\}/);
  const s = bash("sed -n '40,80p' packages/loot-core/src/server/budget/envelope.ts");
  assert.match(s.reason!, /code_get \{"symbols": \["packages\/loot-core\/src\/server\/budget\/envelope\.ts:<Name or line>"\]\}/);
  assert.match(s.reason!, /Read tool \(offset 40, limit 41\)/);
});

test("Grep and Glob tools: code redirected, other files allowed", () => {
  assert.equal(classify("Grep", { pattern: "rankRules", path: "packages" }).deny, true);
  assert.match(classify("Grep", { pattern: "a.b", path: "src" }).reason!, /"patterns":\["\/a\.b\/"\]/);
  assert.equal(classify("Grep", { pattern: "version", glob: "*.json" }).deny, false);
  assert.equal(classify("Glob", { pattern: "packages/**/*.ts" }).deny, true);
  assert.equal(classify("Glob", { pattern: "**/package.json" }).deny, false, "config files are not code");
  assert.equal(classify("Glob", { pattern: "packages/loot-core/**" }).deny, true, "directory sweeps are");
  assert.equal(classify("Glob", { pattern: "*.md" }).deny, false);
});

test("Read and Edit are never redirected", () => {
  assert.equal(classify("Read", { file_path: "/w/packages/x.ts" }).deny, false);
  assert.equal(classify("Edit", { file_path: "/w/packages/x.ts" }).deny, false);
});
