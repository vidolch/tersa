// Usage:
//   npm run run -- --arm A-ts-baseline --task T2 --run 1 --model claude-sonnet-5-5
//   npm run run -- --arm A-ts-baseline --task T1 --chained ...      (T1→T5 in one workspace)
//   npm run run -- --arm A-ts-baseline --task T2 --run 1 --fake-agent ../../reference/T2   (pipeline check, no API)
//
// Phases (default: all). CI runs them as separate steps so the hidden
// acceptance tests and reference solutions can be removed from disk while the
// agent runs:
//   --phase prepare   build the workspace from the start state
//   --phase agent     run the agent only (needs specs/, arms/, harness/runner/)
//   --phase eval      acceptance + perf + run record (needs the full repo)
// --raw-dir puts workspaces and logs outside the repo (default: results/raw).
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { Ajv2020 } from "ajv/dist/2020.js";
import { fakeAgent, runAgent } from "./agent.ts";
import { isArm, isProvider, isTask, loadArm, paths, PROVIDERS, START_STATE } from "./config.ts";
import { runAcceptance, runPerf } from "./evaluate.ts";
import type { AgentMetrics, Usage } from "./metrics.ts";

const { values: a } = parseArgs({
  options: {
    arm: { type: "string" },
    task: { type: "string" },
    run: { type: "string", default: "1" },
    provider: { type: "string", default: process.env.TERSA_PROVIDER ?? "anthropic" },
    model: { type: "string", default: process.env.TERSA_MODEL },
    "max-turns": { type: "string", default: "150" },
    "max-budget-usd": { type: "string", default: process.env.TERSA_MAX_BUDGET_USD ?? "1" },
    chained: { type: "boolean", default: false },
    "fake-agent": { type: "string" },
    "skip-perf": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    phase: { type: "string", default: "all" },
    "raw-dir": { type: "string", default: process.env.TERSA_RAW_DIR },
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
const provider = a.provider!;
if (!isProvider(provider)) fail(`unknown provider ${provider} (expected: ${Object.keys(PROVIDERS).join(", ")})`);
if (!isProvider(provider)) process.exit(2);
const model = a.model || PROVIDERS[provider].defaultModel;
const phase = a.phase!;
if (!["all", "prepare", "agent", "eval"].includes(phase)) fail(`unknown phase ${phase}`);
const does = (p: string) => phase === "all" || phase === p;
const run = Number(a.run);
const armConfig = loadArm(arm);
if (!armConfig.ready && !a["fake-agent"]) fail(`arm ${arm} not ready: ${armConfig.notReadyReason}`);

// ---- layout ----
const rawBase = a["raw-dir"] ? resolve(a["raw-dir"]) : join(paths.results, "raw");
const rawDir = a.chained ? join(rawBase, arm, "chain", task) : join(rawBase, arm, task, `run-${run}`);
const workspace = a.chained ? join(rawBase, arm, "chain", "workspace") : join(rawDir, "workspace");
const recordPath = a.chained
  ? join(paths.results, arm, "chain", `${task}.json`)
  : join(paths.results, arm, task, `run-${run}.json`);
const statePath = join(rawDir, "state.json");
const metricsPath = join(rawDir, "agent-metrics.json");
const label = `[${arm} ${task}${a.chained ? " chained" : ` run ${run}`}]`;

// ---- prepare ----
if (does("prepare")) {
  if (existsSync(recordPath) && !a.force) fail(`${recordPath} exists (use --force to overwrite)`);
  rmSync(rawDir, { recursive: true, force: true });
  mkdirSync(rawDir, { recursive: true });

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
  writeFileSync(statePath, JSON.stringify({ startState }));
  console.log(`${label} workspace ready (${startState}): ${workspace}`);
}

// ---- agent ----
if (does("agent")) {
  if (!existsSync(statePath)) fail(`no prepared workspace at ${rawDir}; run --phase prepare first`);
  const prov = PROVIDERS[provider];
  if (!a["fake-agent"]) {
    const key = process.env[prov.keyEnv];
    if (!key) fail(`${prov.keyEnv} is not set (provider ${provider})`);
    if (prov.baseUrl) {
      // Point Claude Code at the Anthropic-compatible endpoint, and route its
      // background model calls to the same model so nothing goes to Anthropic.
      process.env.ANTHROPIC_BASE_URL = prov.baseUrl;
      process.env.ANTHROPIC_API_KEY = key;
      process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
      process.env.ANTHROPIC_SMALL_FAST_MODEL = model;
      process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
    }
  }
  console.log(`${label} agent starting (${provider}/${model})`);
  const metrics = a["fake-agent"]
    ? fakeAgent(workspace, resolve(a["fake-agent"]))
    : await runAgent({
        arm,
        task,
        armConfig,
        workspace,
        rawDir,
        model,
        maxTurns: Number(a["max-turns"]),
        maxBudgetUsd: Number(a["max-budget-usd"]),
        prices: JSON.parse(readFileSync(paths.prices, "utf8"))[model],
      });

  const require = createRequire(import.meta.url);
  const sdkVersion = JSON.parse(
    readFileSync(join(dirname(require.resolve("@anthropic-ai/claude-agent-sdk")), "package.json"), "utf8"),
  ).version;
  writeFileSync(
    metricsPath,
    JSON.stringify({
      model: a["fake-agent"] ? "fake" : model,
      provider: a["fake-agent"] ? "fake" : provider,
      harness: a["fake-agent"]
        ? { name: "fake-agent", version: "0" }
        : { name: "claude-agent-sdk", version: sdkVersion },
      agent: metrics.m,
      usage: metrics.usage,
      costUsd: metrics.costUsd,
      stopReason: metrics.resultSubtype,
    }),
  );
  console.log(`agent done: ${metrics.m.turns} turns, ${metrics.m.toolCalls} tool calls, $${metrics.costUsd.toFixed(4)}`);
}

// ---- evaluation (agent never sees this) ----
if (does("eval")) {
  if (!existsSync(metricsPath)) fail(`no agent result at ${rawDir}; run --phase agent first`);
  const { startState } = JSON.parse(readFileSync(statePath, "utf8")) as { startState: string };
  const am = JSON.parse(readFileSync(metricsPath, "utf8")) as {
    model: string;
    provider: string;
    harness: { name: string; version: string };
    agent: AgentMetrics;
    usage: Usage;
    costUsd: number;
    stopReason?: string | null;
  };

  const acceptance = runAcceptance(task, workspace, arm, rawDir);
  console.log(
    `acceptance: ${acceptance.passed ? "PASS" : "FAIL"} (${Object.values(acceptance.rules).filter(Boolean).length}/${Object.keys(acceptance.rules).length} rules)`,
  );
  const perf = acceptance.passed && !a["skip-perf"] ? await runPerf(workspace, rawDir) : null;
  if (perf) console.log(`perf: ${perf.passed ? "PASS" : "FAIL"} p95=${perf.p95Ms.toFixed(1)}ms`);

  // Third-party models: the SDK prices them with Claude rates, so recompute.
  const prices = JSON.parse(readFileSync(paths.prices, "utf8"));
  const p = prices[am.model];
  let costUsd = am.costUsd;
  let costSource = "sdk";
  if (p) {
    const u = am.usage;
    costUsd =
      ((u.inputUncached + u.cacheWrite) * p.inputMiss + u.cacheRead * p.inputHit + u.output * p.output) / 1e6;
    costSource = "harness/prices.json";
  } else if (am.provider !== "anthropic" && am.provider !== "fake") {
    console.warn(`warning: no price for ${am.model} in harness/prices.json; costUsd uses Claude rates`);
    costSource = "sdk (wrong rates)";
  }

  const record = {
    arm,
    task,
    run: a.chained ? 1 : run,
    chained: a.chained,
    startState,
    specSha256: createHash("sha256").update(readFileSync(paths.spec(task))).digest("hex"),
    model: am.model,
    provider: am.provider,
    harness: am.harness,
    usage: am.usage,
    agent: am.agent,
    acceptance,
    ...(perf ? { perf } : {}),
    costUsd,
    costSource,
    stopReason: am.stopReason ?? null,
  };

  const ajv = new Ajv2020({ strict: false });
  const validate = ajv.compile(JSON.parse(readFileSync(paths.schema, "utf8")));
  if (!validate(record)) fail(`run record invalid: ${ajv.errorsText(validate.errors)}`);

  mkdirSync(dirname(recordPath), { recursive: true });
  writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");
  console.log(`record: ${recordPath}`);
}
