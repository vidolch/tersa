// Coverage of the Actual Budget suite: for each task, one or two queries an
// agent would plausibly start with must surface every core file of the task's
// ground truth (suites/actual/tasks/<id>/task.json). Runs when ACTUAL_ROOT
// points at a checkout of the suite's pinned commit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Engine } from "../src/engine.ts";

const ROOT = process.env.ACTUAL_ROOT;
const TASKS = join(dirname(fileURLToPath(import.meta.url)), "../../suites/actual/tasks");
const core = (task: string): string[] => JSON.parse(readFileSync(join(TASKS, task, "task.json"), "utf8")).relevant.core;

let engine: Engine;
before(() => {
  if (!ROOT) return;
  engine = new Engine(ROOT);
  engine.index.warm();
});

function covers(task: string, outputs: string[]) {
  const all = outputs.join("\n");
  const missing = core(task).filter((f) => !all.includes(f) && !all.includes(f.split("/").slice(-2).join("/")));
  assert.deepEqual(missing, [], `${task}: core files not reached`);
  return all.length;
}

const cases: [string, () => string[]][] = [
  // "rules are applied in the wrong order" → look at ranking and where rules run
  ["AB1", () => [engine.get({ symbols: ["rankRules", "runRules"], maxLines: 80 })]],
  // new operator: find every place an existing string operator is handled
  ["AB2", () => [engine.find({ patterns: ["doesNotContain"], paths: ["packages/loot-core/src"] })]],
  // new API method next to an existing one
  ["AB3", () => [engine.find({ patterns: ["schedule-dates-get"] }), engine.get({ symbols: ["api/schedule-dates-get"], callers: false })]],
  // overspending: find where last month's overspending is computed
  ["AB4", () => [engine.find({ patterns: ["last-month-overspent"], paths: ["packages/loot-core/src"] })]],
];

for (const [task, queries] of cases) {
  test(`${task}: core files reachable in one or two queries`, { skip: !ROOT && "ACTUAL_ROOT not set" }, () => {
    const t = Date.now();
    const chars = covers(task, queries());
    console.log(`  ${task}: ${chars} chars (~${Math.round(chars / 4)} tokens), ${Date.now() - t} ms`);
  });
}

test("handler indirection: send('rule-add') resolves to the handler and its function", { skip: !ROOT && "ACTUAL_ROOT not set" }, () => {
  const out = engine.get({ symbols: ["rule-add"], callers: false });
  assert.match(out, /### rule-add · handler · packages\/loot-core\/src\/server\/rules\/app\.ts/);
  assert.match(out, /addRule/);
});
