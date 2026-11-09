import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chmodSync, cpSync, createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { paths, ROOT as ROOT_DIR, type Arm, type ArmConfig, type Suite, type Task } from "./config.ts";
import { MetricsCollector, type Price } from "./metrics.ts";
import { redirectHooks } from "./steering.ts";

export interface AgentRunInput {
  suite: Suite;
  arm: Arm;
  task: Task;
  armConfig: ArmConfig;
  workspace: string;
  rawDir: string;
  model: string;
  maxTurns: number;
  /** Hard spending cap for this run, in USD. */
  maxBudgetUsd: number;
  /** Wall-clock limit for the agent phase, minutes. */
  maxMinutes: number;
  /** Prices from harness/prices.json; when present the runner enforces the cap itself. */
  prices?: Price;
}

/** Replaces {{ROOT}} (this repo) and {{WORKSPACE}} (the agent's workspace) in an arm's MCP config. */
export function resolvePlaceholders<T>(value: T, workspace: string): T {
  return JSON.parse(
    JSON.stringify(value).replaceAll("{{ROOT}}", ROOT_DIR).replaceAll("{{WORKSPACE}}", workspace),
  );
}

/** Identical across arms except the profile, the arm's context files and (arm D) the bundle. */
export async function buildPrompt(
  suite: Suite,
  arm: Arm,
  task: Task,
  armConfig: ArmConfig,
  workspace?: string,
): Promise<{ prompt: string; overheadChars: number; bundle?: { tokens: number; files: string[] } }> {
  const spec = readFileSync(paths.spec(suite, task), "utf8");
  const profile = readFileSync(paths.profile(suite, arm), "utf8");
  const extras = armConfig.contextFiles.map((f) => readFileSync(join(paths.arm(arm), f), "utf8"));
  const prompt = [
    "Implement the task below in the current directory. The service must satisfy every rule in the spec.",
    "Work autonomously; do not ask questions. Stop when you believe the task is complete.",
    "",
    "<profile>",
    profile.trim(),
    "</profile>",
    ...extras.map((e) => `\n<context>\n${e.trim()}\n</context>`),
    "",
    "<spec>",
    spec.trim(),
    "</spec>",
  ].join("\n");
  let overheadChars = extras.reduce((n, e) => n + e.length, 0);
  if (!armConfig.bundle || !workspace) return { prompt, overheadChars };
  // The bundle is built from the spec only (never from ground truth), on the agent's own workspace.
  const { Engine } = await import("../../../query/src/engine.ts");
  const { buildBundle } = await import("../../../query/src/bundle.ts");
  const b = buildBundle(new Engine(workspace), spec, { budgetTokens: armConfig.bundle.budgetTokens });
  overheadChars += b.text.length;
  return {
    prompt: `${prompt}\n\n<context>\n${b.text}\n</context>`,
    overheadChars,
    bundle: { tokens: b.tokens, files: b.files.slice(0, 30) },
  };
}

/**
 * Starts the query daemon for this run and returns the env that puts `tersa`
 * on the agent's PATH. The daemon keeps the index and session dedupe alive
 * across CLI calls.
 */
async function startShellQuery(workspace: string, rawDir: string): Promise<{ env: Record<string, string>; daemon: ChildProcess }> {
  const bin = join(rawDir, "bin");
  mkdirSync(bin, { recursive: true });
  const socket = join(rawDir, "tersa.sock");
  const cli = join(ROOT_DIR, "query", "src", "cli.ts");
  writeFileSync(join(bin, "tersa"), `#!/bin/sh\nexec "${process.execPath}" --disable-warning=ExperimentalWarning "${cli}" "$@"\n`);
  chmodSync(join(bin, "tersa"), 0o755);
  const daemon = spawn(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", join(ROOT_DIR, "query", "src", "daemon.ts"), "--root", workspace, "--socket", socket],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("query daemon did not start within 60s")), 60_000);
    daemon.stdout!.on("data", (d) => {
      if (String(d).includes("ready")) {
        clearTimeout(t);
        resolve();
      }
    });
    daemon.on("exit", (code) => reject(new Error(`query daemon exited with ${code}`)));
  });
  return { env: { PATH: `${bin}:${process.env.PATH}`, TERSA_SOCKET: socket }, daemon };
}

export async function runAgent(input: AgentRunInput): Promise<MetricsCollector> {
  const { prompt, overheadChars: promptOverhead, bundle } = await buildPrompt(input.suite, input.arm, input.task, input.armConfig, input.workspace);
  const steering = input.armConfig.steering ?? {};
  const systemAppend = (steering.systemPrompt ?? [])
    .map((f) => readFileSync(join(paths.arm(input.arm), f), "utf8").trim())
    .join("\n\n");
  const overheadChars = promptOverhead + systemAppend.length;
  const metrics = new MetricsCollector();
  const transcript = createWriteStream(join(input.rawDir, "transcript.jsonl"));
  if (bundle) {
    metrics.bundle = bundle;
    console.log(`bundle: ${bundle.tokens} tokens, ${bundle.files.length} files`);
  }
  const shell = input.armConfig.shellQuery ? await startShellQuery(input.workspace, input.rawDir) : null;
  const stderrLog = createWriteStream(join(input.rawDir, "agent-stderr.log"));
  const stderrTail: string[] = [];

  const q = query({
    prompt,
    options: {
      cwd: input.workspace,
      model: input.model,
      maxTurns: input.maxTurns,
      tools: input.armConfig.tools,
      allowedTools: [...input.armConfig.tools, ...(input.armConfig.allowedTools ?? [])],
      mcpServers: resolvePlaceholders(input.armConfig.mcpServers, input.workspace) as any,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      // Isolation: no user/project settings or CLAUDE.md leak into runs.
      settingSources: [],
      ...(shell ? { env: { ...(process.env as Record<string, string>), ...shell.env } } : {}),
      // raw stream events carry the final output token count per request (pricing, cap)
      includePartialMessages: true,
      ...(systemAppend ? { systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: systemAppend } } : {}),
      ...(steering.redirect ? { hooks: redirectHooks(metrics.steering) as any } : {}),
      stderr: (data: string) => {
        stderrLog.write(data);
        stderrTail.push(...data.split("\n").filter(Boolean).map((l) => l.slice(0, 400)));
        if (stderrTail.length > 200) stderrTail.splice(0, stderrTail.length - 200);
      },
      // Claude models: the SDK enforces the cap with correct prices.
      ...(input.prices ? {} : { maxBudgetUsd: input.maxBudgetUsd }),
    },
  });

  const started = Date.now();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    q.close();
  }, input.maxMinutes * 60_000);
  let lastTurn = 0;
  const elapsed = () => `${Math.round((Date.now() - started) / 1000)}s`;
  const diagnose = () => console.error(`last tool calls:\n  ${metrics.recentCalls.join("\n  ") || "(none)"}`);
  try {
  for await (const msg of q) {
    // Keep the transcript readable: only the usage-bearing stream events.
    if (msg.type !== "stream_event" || msg.event?.type === "message_start" || msg.event?.type === "message_delta") {
      transcript.write(JSON.stringify(msg) + "\n");
    }
    metrics.observe(msg);
    // Live progress, one line per turn, so a slow or stuck run is visible in the job log.
    if (metrics.turnCount() !== lastTurn) {
      lastTurn = metrics.turnCount();
      const t = metrics.liveTokens();
      const cost = input.prices ? ` $${metrics.liveCost(input.prices).toFixed(4)}` : "";
      console.log(`[turn ${lastTurn} ${elapsed()}] in ${Math.round(t.input / 1000)}k out ${Math.round(t.output / 1000)}k${cost} | ${metrics.recentCalls.at(-1)?.slice(0, 100) ?? ""}`);
    }
    if (msg.type === "system" && msg.subtype === "api_retry") {
      console.log(`[retry ${elapsed()}] attempt ${msg.attempt}/${msg.max_retries}, status ${msg.error_status ?? "no response"}, waiting ${Math.round((msg.retry_delay_ms ?? 0) / 1000)}s`);
    }
    // Other models: enforce the cap ourselves from per-message usage.
    if (input.prices && metrics.liveCost(input.prices) > input.maxBudgetUsd) {
      metrics.resultSubtype = "error_max_budget_usd";
      transcript.write(JSON.stringify({ type: "harness", event: "budget_exceeded", usd: metrics.liveCost(input.prices) }) + "\n");
      q.close();
      break;
    }
  }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (timedOut) {
      // closing the query on timeout may surface as an error; it is not a crash
    } else if (/maximum number of turns/i.test(message)) {
      // hitting the turn limit is the agent failing, not infrastructure: scored as a failed run
      metrics.resultSubtype = "error_max_turns";
      console.error(`agent stopped: turn limit reached`);
    } else {
    // The run counts as failed but still gets a record: evaluate whatever the agent left.
    metrics.resultSubtype = "error_agent_crash";
    metrics.crash = message.slice(0, 2000);
    transcript.write(JSON.stringify({ type: "harness", event: "agent_crash", message: metrics.crash }) + "\n");
    console.error(`agent crashed: ${metrics.crash.slice(0, 500)}`);
    console.error(`last stderr lines:\n${stderrTail.slice(-20).join("\n")}`);
    diagnose();
    }
  } finally {
    clearTimeout(timer);
    shell?.daemon.kill("SIGTERM");
  }
  if (timedOut) {
    // A run that hits the wall-clock limit is a failed run (same limit for every arm), not a crash.
    metrics.resultSubtype = "error_wall_timeout";
    transcript.write(JSON.stringify({ type: "harness", event: "wall_timeout", minutes: input.maxMinutes }) + "\n");
    console.error(`agent stopped: wall-clock limit of ${input.maxMinutes} min reached after ${metrics.turnCount()} turns`);
    diagnose();
  }
  transcript.end();
  stderrLog.end();
  metrics.finish(overheadChars);
  return metrics;
}

/**
 * Pipeline check without an API call: copies a known solution's src/ into the
 * workspace as if an agent had produced it. Usage and agent metrics are zero.
 */
export function fakeAgent(workspace: string, solution: string): MetricsCollector {
  if (solution.endsWith(".patch")) {
    // An empty patch is a fake agent that changes nothing (validation of start states).
    if (readFileSync(solution, "utf8").trim() === "") return finishFake();
    const r = spawnSync("git", ["apply", solution], { cwd: workspace, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`fake agent: git apply failed: ${r.stderr}`);
  } else {
    cpSync(join(solution, "src"), join(workspace, "src"), { recursive: true, force: true });
  }
  return finishFake();
}

function finishFake(): MetricsCollector {
  const metrics = new MetricsCollector();
  metrics.m.completed = true;
  metrics.finish(0);
  return metrics;
}
