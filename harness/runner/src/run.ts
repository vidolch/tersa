// Usage:
//   npm run run -- --arm A-ts-baseline --task T2 --run 1 --model claude-sonnet-5-5
//   npm run run -- --arm A-ts-baseline --task T1 --chained ...      (T1→T5 in one workspace)
//   npm run run -- --arm A-ts-baseline --task T2 --run 1 --fake-agent ../../reference/T2   (pipeline check, no API)
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { Ajv2020 } from "ajv/dist/2020.js";
import { fakeAgent, runAgent } from "./agent.ts";
import { isArm, isTask, loadArm, paths, START_STATE } from "./config.ts";
import { runAcceptance, runPerf } from "./evaluate.ts";

const { values: a } = parseArgs({
  options: {
    arm: { type: "string" },
    task: { type: "string" },
    run: { type: "string", default: "1" },
    model: { type: "string", default: process.env.TERSA_MODEL ?? "claude-sonnet-5-5" },
    "max-turns": { type: "string", default: "150" },
    chained: { type: "boolean", default: false },
    "fake-agent": { type: "string" },
    "skip-perf": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  },
});

const fail = (msg: string): never => {
  console.error(`error: ${msg}`);
  process.exit(2);
};

const arm = a.arm ?? fail("--arm required");
const task = a.task ?? fail("--task required");
if (!isArm(arm)) fail(`unknown arm ${arm}`);
if (!isTask(task)) fail(`unknown task ${task}`);
if (!isArm(arm) || !isTask(task)) process.exit(2);
const run = Number(a.run);
const armConfig = loadArm(arm);
if (!armConfig.ready && !a["fake-agent"]) fail(`arm ${arm} not ready: ${armConfig.notReadyReason}`);

// ---- layout ----
const rawDir = a.chained
  ? join(paths.results, "raw", arm, "chain", task)
  : join(paths.results, "raw", arm, task, `run-${run}`);
const workspace = a.chained ? join(paths.results, "raw", arm, "chain", "workspace") : join(rawDir, "workspace");
const recordPath = a.chained
  ? join(paths.results, arm, "chain", `${task}.json`)
  : join(paths.results, arm, task, `run-${run}.json`);

if (existsSync(recordPath) && !a.force) fail(`${recordPath} exists (use --force to overwrite)`);
rmSync(rawDir, { recursive: true, force: true });
mkdirSync(rawDir, { recursive: true });

// ---- workspace ----
const noModules = (src: string) => !src.includes("/node_modules");
let startState: string;
if (a.chained && task !== "T1") {
  if (!existsSync(workspace)) fail("chained workspace missing; run T1 with --chained first");
  startState = "chain";
} else {
  rmSync(workspace, { recursive: true, force: true });
  cpSync(paths.scaffold(arm), workspace, { recursive: true, filter: noModules });
  const snap = START_STATE[task];
  if (snap) {
    rmSync(join(workspace, "src"), { recursive: true, force: true });
    cpSync(join(paths.reference(snap), "src"), join(workspace, "src"), { recursive: true });
  }
  startState = snap ? `reference/${snap}` : "scaffold";
  const inst = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--silent"], {
    cwd: workspace,
    stdio: "inherit",
  });
  if (inst.status !== 0) fail("npm install failed in workspace");
}

// ---- agent ----
console.log(`[${arm} ${task}${a.chained ? " chained" : ` run ${run}`}] agent starting (${startState})`);
const metrics = a["fake-agent"]
  ? fakeAgent(workspace, resolve(a["fake-agent"]))
  : await runAgent({
      arm,
      task,
      armConfig,
      workspace,
      rawDir,
      model: a.model!,
      maxTurns: Number(a["max-turns"]),
    });
console.log(`agent done: ${metrics.m.turns} turns, ${metrics.m.toolCalls} tool calls, $${metrics.costUsd.toFixed(4)}`);

// ---- evaluation (agent never sees this) ----
const acceptance = runAcceptance(task, workspace, arm, rawDir);
console.log(`acceptance: ${acceptance.passed ? "PASS" : "FAIL"} (${Object.values(acceptance.rules).filter(Boolean).length}/${Object.keys(acceptance.rules).length} rules)`);
const perf = acceptance.passed && !a["skip-perf"] ? await runPerf(workspace, rawDir) : null;
if (perf) console.log(`perf: ${perf.passed ? "PASS" : "FAIL"} p95=${perf.p95Ms.toFixed(1)}ms`);

// ---- record ----
const require = createRequire(import.meta.url);
const sdkVersion = JSON.parse(
  readFileSync(join(dirname(require.resolve("@anthropic-ai/claude-agent-sdk")), "package.json"), "utf8"),
).version;

const record = {
  arm,
  task,
  run: a.chained ? 1 : run,
  chained: a.chained,
  startState,
  specSha256: createHash("sha256").update(readFileSync(paths.spec(task))).digest("hex"),
  model: a["fake-agent"] ? "fake" : a.model!,
  harness: a["fake-agent"]
    ? { name: "fake-agent", version: "0" }
    : { name: "claude-agent-sdk", version: sdkVersion },
  usage: metrics.usage,
  agent: metrics.m,
  acceptance,
  ...(perf ? { perf } : {}),
  costUsd: metrics.costUsd,
};

const ajv = new Ajv2020({ strict: false });
const validate = ajv.compile(JSON.parse(readFileSync(paths.schema, "utf8")));
if (!validate(record)) fail(`run record invalid: ${ajv.errorsText(validate.errors)}`);

mkdirSync(dirname(recordPath), { recursive: true });
writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");
console.log(`record: ${recordPath}`);
