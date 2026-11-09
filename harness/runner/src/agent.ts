import { spawnSync } from "node:child_process";
import { cpSync, createWriteStream, readFileSync } from "node:fs";
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
  /** Prices from harness/prices.json; when present the runner enforces the cap itself. */
  prices?: Price;
}

/** Replaces {{ROOT}} (this repo) and {{WORKSPACE}} (the agent's workspace) in an arm's MCP config. */
export function resolvePlaceholders<T>(value: T, workspace: string): T {
  return JSON.parse(
    JSON.stringify(value).replaceAll("{{ROOT}}", ROOT_DIR).replaceAll("{{WORKSPACE}}", workspace),
  );
}

/** Identical across arms except the profile and the arm's context files. */
export function buildPrompt(
  suite: Suite,
  arm: Arm,
  task: Task,
  armConfig: ArmConfig,
): { prompt: string; overheadChars: number } {
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
  return { prompt, overheadChars: extras.reduce((n, e) => n + e.length, 0) };
}

export async function runAgent(input: AgentRunInput): Promise<MetricsCollector> {
  const { prompt, overheadChars: promptOverhead } = buildPrompt(input.suite, input.arm, input.task, input.armConfig);
  const steering = input.armConfig.steering ?? {};
  const systemAppend = (steering.systemPrompt ?? [])
    .map((f) => readFileSync(join(paths.arm(input.arm), f), "utf8").trim())
    .join("\n\n");
  const overheadChars = promptOverhead + systemAppend.length;
  const metrics = new MetricsCollector();
  const transcript = createWriteStream(join(input.rawDir, "transcript.jsonl"));
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

  try {
  for await (const msg of q) {
    transcript.write(JSON.stringify(msg) + "\n");
    metrics.observe(msg);
    // Other models: enforce the cap ourselves from per-message usage.
    if (input.prices && metrics.liveCost(input.prices) > input.maxBudgetUsd) {
      metrics.resultSubtype = "error_max_budget_usd";
      transcript.write(JSON.stringify({ type: "harness", event: "budget_exceeded", usd: metrics.liveCost(input.prices) }) + "\n");
      q.close();
      break;
    }
  }
  } catch (err) {
    // The run counts as failed but still gets a record: evaluate whatever the agent left.
    const message = err instanceof Error ? err.message : String(err);
    metrics.resultSubtype = "error_agent_crash";
    metrics.crash = message.slice(0, 2000);
    transcript.write(JSON.stringify({ type: "harness", event: "agent_crash", message: metrics.crash }) + "\n");
    console.error(`agent crashed: ${metrics.crash.slice(0, 500)}`);
    console.error(`last stderr lines:\n${stderrTail.slice(-20).join("\n")}`);
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
