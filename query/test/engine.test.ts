// Contract tests on a small fixture project (CONTRACT.md sections 2–4).
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Engine } from "../src/engine.ts";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixture");

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "tersa-q-"));
  cpSync(FIXTURE, dir, { recursive: true });
  return { dir, engine: new Engine(dir) };
}

test("indexes functions, arrow consts, classes with members, and string handlers", () => {
  const { engine } = fresh();
  const names = [...engine.index.names()];
  for (const n of ["add", "double", "Counter", "increment", "count", "total", "run", "calc/double", "handlers"]) {
    assert.ok(names.includes(n), `missing ${n}`);
  }
});

test("code_get: line-numbered body, doc comment, uses with signatures, callers", () => {
  const { engine } = fresh();
  const out = engine.get({ symbols: ["add"] });
  assert.match(out, /^### add · function · src\/lib\/math\.ts:1-4 · #[0-9a-f]{6} · to edit: Read offset 1 limit 4$/m);
  assert.match(out, /1│\/\*\* Adds two numbers\. \*\//);
  assert.match(out, /2│export function add\(a: number, b: number\): number \{/);
  assert.match(out, /used by \(\d+\):/);
  assert.match(out, /double — src\/lib\/math\.ts:6/);
  assert.match(out, /Counter\.increment — src\/lib\/math\.ts:11/);
  assert.match(out, /total — src\/app\.ts:8/);
  assert.doesNotMatch(out, /import \{ add/, "import lines are not uses");

  const t = engine.get({ symbols: ["total"], callers: false });
  assert.match(t, /uses:\n {2}export function add\(a: number, b: number\): number — lib\/math\.ts:1$/m);
});

test("code_get: dedupe within a response and across the session, re-sent after a change", () => {
  const { dir, engine } = fresh();
  const both = engine.get({ symbols: ["add", "src/lib/math.ts:add"], deps: "none", callers: false });
  assert.match(both, /\(shown above, #[0-9a-f]{6}\)/);
  const again = engine.get({ symbols: ["add"], deps: "none", callers: false });
  assert.match(again, /\(unchanged since shown earlier, #[0-9a-f]{6}\)/);

  const file = join(dir, "src/lib/math.ts");
  writeFileSync(file, "/** Adds two numbers. */\nexport function add(a: number, b: number): number {\n  return b + a;\n}\n");
  const future = new Date(Date.now() + 5000);
  utimesSync(file, future, future);
  const changed = engine.get({ symbols: ["add"], deps: "none", callers: false });
  assert.match(changed, /3│ {2}return b \+ a;/);
});

test("names: Class.member, path:Name, path:line, handler strings", () => {
  const { engine } = fresh();
  assert.match(engine.get({ symbols: ["Counter.increment"], callers: false }), /### Counter\.increment · method · src\/lib\/math\.ts:10-13/);
  assert.match(engine.get({ symbols: ["lib/math.ts:double"], callers: false }), /### double · function/);
  assert.match(engine.get({ symbols: ["src/app.ts:13"], callers: false }), /### run · function · src\/app\.ts:11-15/);
  assert.match(engine.get({ symbols: ["calc/double"], callers: false }), /### calc\/double · handler · src\/app\.ts:5-5/);
});

test("not found returns nearest names; never throws", () => {
  const { engine } = fresh();
  const out = engine.get({ symbols: ["totl", "nothingLikeThis"] });
  assert.match(out, /not found: totl\n {2}did you mean: total/);
  assert.match(out, /not found: nothingLikeThis/);
});

test("code_find groups matches by enclosing symbol, test files last", () => {
  const { engine } = fresh();
  const out = engine.find({ patterns: ["total(", "/add\\(\\w+, \\w+\\)/"] });
  assert.match(out, /### "total\(" — 3 lines in 3 symbols/);
  const first = out.indexOf("total · function");
  const testHit = out.indexOf("· test");
  assert.ok(first > 0 && testHit > first, "non-test symbols come before test symbols");
  assert.match(out, /### "\/add\\\(\\w\+, \\w\+\\\)\/" — 2 lines in 2 symbols/); // add(this.count, by) does not match \w+
});

test("code_refs: compiler-resolved, not text", () => {
  const { engine } = fresh();
  const out = engine.refsTool({ symbols: ["Counter.increment"] });
  assert.match(out, /references to Counter\.increment .* — 1 in \./);
  assert.match(out, /run — src\/app\.ts:13 — c\.increment\(2\);/);
});

test("code_outline: files and directories", () => {
  const { engine } = fresh();
  const f = engine.outline({ paths: ["src/lib/math.ts"] });
  assert.match(f, /### outline src\/lib\/math\.ts \(\d+ lines\)/);
  assert.match(f, /\n {2}1-4 export function add\(a: number, b: number\): number/);
  assert.match(f, /\n {4}10-13 method increment\(by = 1\): number/);
  const d = engine.outline({ paths: ["src"] });
  assert.match(d, /app\.ts \(\d+ lines\): handlers, calc\/double, total, run/);
  assert.match(d, /lib\/ \(1 files\)/);
  assert.match(engine.outline({ paths: ["srcx"] }), /not found: srcx/);
});
