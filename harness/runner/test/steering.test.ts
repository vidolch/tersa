import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { classify, READ_MAX_RANGE, READ_MAX_WHOLE, redirectHooks } from "../src/steering.ts";

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

test("Read: whole large source files redirected; ranges, small files and non-code allowed", () => {
  const dir = mkdtempSync(join(tmpdir(), "steer-"));
  const big = join(dir, "packages/core/src/big.ts");
  const small = join(dir, "small.ts");
  const json = join(dir, "big.json");
  for (const [p, n] of [[big, READ_MAX_WHOLE + 50], [small, 40], [json, 5000]] as const) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, "x\n".repeat(n));
  }
  const whole = classify("Read", { file_path: big });
  assert.equal(whole.deny, true);
  assert.match(whole.reason!, /packages\/core\/src\/big\.ts has 201 lines/);
  assert.match(whole.reason!, /code_outline \{"paths": \["packages\/core\/src\/big\.ts"\]\}/);
  assert.equal(classify("Read", { file_path: big, offset: 10, limit: 80 }).deny, false);
  assert.equal(classify("Read", { file_path: big, limit: READ_MAX_RANGE + 1 }).deny, true);
  assert.equal(classify("Read", { file_path: small }).deny, false);
  assert.equal(classify("Read", { file_path: json }).deny, false);
  assert.equal(classify("Edit", { file_path: big }).deny, false);
});

test("the first redirect of a run explains all rules, later ones don't", async () => {
  const counter = { redirects: 0, byTool: {} };
  const hook = redirectHooks(counter).PreToolUse[0].hooks[0];
  const call = (command: string) => hook({ tool_name: "Bash", tool_input: { command } } as any) as Promise<any>;
  const first = await call("grep -rn foo packages/x");
  const second = await call("grep -rn bar packages/x");
  assert.match(first.hookSpecificOutput.permissionDecisionReason, /How code reading works in this setup/);
  assert.doesNotMatch(second.hookSpecificOutput.permissionDecisionReason, /How code reading works/);
  assert.equal(counter.redirects, 2);
});
