import { test } from "node:test";
import assert from "node:assert/strict";
import { shownFile, shownFiles } from "../../../arms/Q-pi-contracts/contracts-on-read.ts";

const ws = "/w";
const f = "packages/loot-core/src/server/rules/rule-utils.ts";
test("single-file read commands as agents write them", () => {
  for (const c of [
    `cd /w; sed -n 60,120p ${f}`,
    `cd /w && cat ${f}`,
    `cd /w/packages/loot-core/src && sed -n '1,80p' server/rules/rule-utils.ts`,
    `cd /w; cat ${f} | head -80`,
    `cd /w; nl -ba ${f} | sed -n 60,90p`,
    `sed -n 1,10p /w/${f}`,
    `cd /w; sed -n 1,80p ${f} 2>/dev/null`,
  ]) assert.equal(shownFile("bash", { command: c }, ws), f, c);
  assert.equal(shownFile("read", { path: f }, ws), f);
});

test("not a single-file read", () => {
  for (const c of [
    `cd /w; sed -i 's/a/b/' ${f}`,
    `cd /w; cat > ${f} << 'EOF'`,
    `cd /w; grep -rn rankRules packages`,
    `cd /w; cat ${f}; cat packages/x.ts`,
    `cd /w; cat ${f} | grep rank`,
    `cd /w; git status`,
  ]) assert.equal(shownFile("bash", { command: c }, ws), null, c);
});

test("shownFiles: batched reads and grep output, as in iteration 20b's logs", () => {
  const out = "x";
  assert.deepEqual(shownFiles("bash", { command: `cd /w; sed -n 60,140p ${f}; grep -n "sort" packages/a.ts packages/b.ts | head -40` }, ws, out).sort(), [f, "packages/a.ts", "packages/b.ts"].sort());
  assert.deepEqual(shownFiles("bash", { command: `cd /w/packages/loot-core/src; grep -rn rankRules .` }, ws, "server/rules/rule-utils.ts:87:export function rankRules("), [f]);
  assert.deepEqual(shownFiles("bash", { command: `cd /w; python3 - <<'EOF'\np='${f}'\nEOF` }, ws, ""), []);
  assert.deepEqual(shownFiles("bash", { command: `cd /w; sed -i 's/a/b/' ${f}` }, ws, ""), []);
});
