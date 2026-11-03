import { cpSync, createWriteStream, readFileSync } from "node:fs";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { paths, type Arm, type ArmConfig, type Task } from "./config.ts";
import { MetricsCollector } from "./metrics.ts";

export interface AgentRunInput {
  arm: Arm;
  task: Task;
  armConfig: ArmConfig;
  workspace: string;
  rawDir: string;
  model: string;
  maxTurns: number;
  /** Hard spending cap for this run, in USD. */
  maxBudgetUsd: number;
  /** Real prices for models the SDK cannot price; enables the cap for them. */
  prices?: { inputMiss: number; inputHit: number; output: number };
}

/** Identical across arms except the profile and the arm's context files. */
export function buildPrompt(arm: Arm, task: Task, armConfig: ArmConfig): { prompt: string; overheadChars: number } {
  const spec = readFileSync(paths.spec(task), "utf8");
  const profile = readFileSync(join(paths.arm(arm), "profile.md"), "utf8");
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
  const { prompt, overheadChars } = buildPrompt(input.arm, input.task, input.armConfig);
  const metrics = new MetricsCollector();
  const transcript = createWriteStream(join(input.rawDir, "transcript.jsonl"));

  const q = query({
    prompt,
    options: {
      cwd: input.workspace,
      model: input.model,
      maxTurns: input.maxTurns,
      tools: input.armConfig.tools,
      allowedTools: input.armConfig.tools,
      mcpServers: input.armConfig.mcpServers as any,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      // Isolation: no user/project settings or CLAUDE.md leak into runs.
      settingSources: [],
      // Claude models: the SDK enforces the cap with correct prices.
      ...(input.prices ? {} : { maxBudgetUsd: input.maxBudgetUsd }),
    },
  });

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
  transcript.end();
  metrics.finish(overheadChars);
  return metrics;
}

/**
 * Pipeline check without an API call: copies a known solution's src/ into the
 * workspace as if an agent had produced it. Usage and agent metrics are zero.
 */
export function fakeAgent(workspace: string, solutionDir: string): MetricsCollector {
  cpSync(join(solutionDir, "src"), join(workspace, "src"), { recursive: true, force: true });
  const metrics = new MetricsCollector();
  metrics.m.completed = true;
  metrics.finish(0);
  return metrics;
}
