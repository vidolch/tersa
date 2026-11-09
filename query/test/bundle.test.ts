import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildBundle, extractTerms, proseStems, variants } from "../src/bundle.ts";
import { Engine } from "../src/engine.ts";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixture");

test("terms: code spans, identifiers and naming variants; stop words dropped", () => {
  const t = extractTerms("Fix `Counter.increment` so that total() works. The calc/double handler and the_value matter.");
  assert.ok(t.includes("Counter.increment") && t.includes("increment"));
  assert.ok(t.includes("calc/double") && t.includes("the_value"));
  assert.ok(!t.includes("that") && !t.includes("works"));
  assert.deepEqual(variants("lastMonthOverspent").sort(), ["last-month-overspent", "lastMonthOverspent", "last_month_overspent"].sort());
  assert.ok(proseStems("Rules are ranked in the wrong order").includes("rank"));
});

test("bundle: definitions first, within budget, files listed", () => {
  const b = buildBundle(new Engine(FIXTURE), "The `total` function returns the wrong sum when `Counter.increment` runs first.", { budgetTokens: 400 });
  assert.ok(b.tokens <= 400 + 5);
  assert.match(b.text, /### total · function · src\/app\.ts:7-9/);
  assert.match(b.text, /Counter\.increment/);
  assert.ok(b.files.includes("src/app.ts") && b.files.includes("src/lib/math.ts"));
  assert.match(b.text, /selected automatically from the task text/);
});
