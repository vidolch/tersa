import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const TASKS = ["T1", "T2", "T3", "T4", "T5"] as const;
/** Task ids are unique across suites (T* = urlshort, AB* = actual). */
export type Task = string;
export const SUITES = ["urlshort", "actual", "hono"] as const;
export type Suite = (typeof SUITES)[number];
export const ARMS = ["A-ts-baseline", "B-ts-query", "B2-ts-query-shell", "C-tersa-lang", "D-ts-bundle", "F-ts-exhaustive", "G-ts-agreement", "H-ts-contracts", "I-ts-gencontracts", "P-pi-baseline", "Q-pi-contracts", "R-pi-name", "S-pi-example", "T-pi-specintent"] as const;
export type Arm = (typeof ARMS)[number];

/** Reference snapshot each task starts from; null = arm scaffold only. */
export const START_STATE: Record<string, string | null> = {
  T1: null,
  T2: "T1",
  T3: "T3-start",
  T4: "T3",
  T5: "T4",
};

export const SPEC_FILE: Record<string, string> = {
  T1: "T1-initial.md",
  T2: "T2-feature-alias-expiry.md",
  T3: "T3-bugfix-click-count.md",
  T4: "T4-refactor-storage.md",
  T5: "T5-unfamiliar-stats.md",
};

/** Contract for arms/<arm>/agent.json. */
export interface ArmConfig {
  ready: boolean;
  notReadyReason?: string;
  /** Built-in agent tools the arm may use. */
  tools: string[];
  /** MCP servers given to the agent (query layer etc.). */
  mcpServers: Record<string, unknown>;
  /** Files under arms/<arm>/ appended to the prompt; their tokens count as context overhead. */
  contextFiles: string[];
  /** Extra tools to allow without prompting (e.g. MCP tools: mcp__<server>__<tool>). */
  allowedTools?: string[];
  /** Put a task-scoped context bundle, built from the spec by query/src/bundle.ts, in the first prompt. */
  bundle?: { budgetTokens?: number };
  /**
   * Per task, a patch under arms/<arm>/ applied to the start state before the agent starts
   * (a code-structure change the arm stands for, e.g. exhaustive dispatch). Tasks without one
   * can't run in this arm.
   */
  codePatches?: Record<string, string>;
  /** Per task, a note appended to the spec (an arm that adds one sentence of intent to the report). */
  specNotes?: Record<string, string>;
  /** Agent harness: Claude Code through the Agent SDK (default) or the pi coding agent (src/agent-pi.ts). */
  harness?: "claude-code" | "pi";
  /** pi only: module under arms/<arm>/ whose default export is a pi extension factory. */
  piExtension?: string;
  /** Start the query daemon for the run and put the `tersa` command on the agent's PATH. */
  shellQuery?: boolean;
  /** How the harness steers the agent toward this arm's tools (see src/steering.ts). */
  steering?: {
    /** Files under arms/<arm>/ appended to Claude Code's system prompt; counted as overhead. */
    systemPrompt?: string[];
    /** Deny code-reading calls the query tools cover, with the equivalent call. */
    redirect?: boolean;
  };
}

export const paths = {
  arm: (arm: Arm) => join(ROOT, "arms", arm),
  scaffold: (arm: Arm) => join(ROOT, "arms", arm, "scaffold"),
  reference: (snapshot: string) => join(ROOT, "reference", snapshot),
  suite: (suite: Suite) => join(ROOT, "suites", suite),
  spec: (suite: Suite, task: Task) =>
    suite === "urlshort" ? join(ROOT, "specs", SPEC_FILE[task]) : join(ROOT, "suites", suite, "tasks", task, "spec.md"),
  /** Environment description given to the agent: per arm for urlshort, per suite otherwise. */
  profile: (suite: Suite, arm: Arm) =>
    suite === "urlshort" ? join(ROOT, "arms", arm, "profile.md") : join(ROOT, "suites", suite, "profile.md"),
  acceptance: join(ROOT, "acceptance"),
  perf: join(ROOT, "perf", "load.js"),
  schema: join(ROOT, "harness", "run-record.schema.json"),
  prices: join(ROOT, "harness", "prices.json"),
  results: process.env.TERSA_RESULTS_DIR ? resolve(process.env.TERSA_RESULTS_DIR) : join(ROOT, "results"),
};

export function loadArm(arm: Arm): ArmConfig {
  return JSON.parse(readFileSync(join(paths.arm(arm), "agent.json"), "utf8"));
}

export function suiteTasks(suite: Suite): string[] {
  if (suite === "urlshort") return [...TASKS];
  return JSON.parse(readFileSync(join(ROOT, "suites", suite, "suite.json"), "utf8")).tasks;
}
export function isSuite(v: string): v is Suite {
  return (SUITES as readonly string[]).includes(v);
}
export function isTask(v: string, suite: Suite = "urlshort"): v is Task {
  return suiteTasks(suite).includes(v);
}
export function isArm(v: string): v is Arm {
  return (ARMS as readonly string[]).includes(v);
}

/** How the agent reaches a model. Anthropic is the default; others use an Anthropic-compatible endpoint. */
export const PROVIDERS = {
  anthropic: { baseUrl: null, keyEnv: "ANTHROPIC_API_KEY", defaultModel: "claude-haiku-5-5", defaultBudgetUsd: 3 },
  deepseek: {
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/anthropic",
    keyEnv: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-flash",
    defaultBudgetUsd: 0.5,
  },
} as const;
export type Provider = keyof typeof PROVIDERS;
export function isProvider(v: string): v is Provider {
  return v in PROVIDERS;
}

/** Model settings an experiment may vary: `effort=low|medium|high|xhigh|max`, `thinking=adaptive|disabled`, comma-separated. */
export interface ModelOptions {
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  thinking?: "adaptive" | "disabled";
}

export function parseModelOptions(s: string | undefined): ModelOptions {
  const out: ModelOptions = {};
  for (const part of (s ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const [k, v] = part.split("=");
    if (k === "effort" && ["low", "medium", "high", "xhigh", "max"].includes(v)) out.effort = v as ModelOptions["effort"];
    else if (k === "thinking" && ["adaptive", "disabled"].includes(v)) out.thinking = v as ModelOptions["thinking"];
    else throw new Error(`bad model option "${part}" (expected effort=low|medium|high|xhigh|max or thinking=adaptive|disabled)`);
  }
  return out;
}

export function modelOptionsLabel(o: ModelOptions | undefined): string {
  return o && Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k}=${v}`).join(",") : "";
}
