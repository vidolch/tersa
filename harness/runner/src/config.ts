import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const TASKS = ["T1", "T2", "T3", "T4", "T5"] as const;
export type Task = (typeof TASKS)[number];
export const ARMS = ["A-ts-baseline", "B-ts-query", "C-tersa-lang"] as const;
export type Arm = (typeof ARMS)[number];

/** Reference snapshot each task starts from; null = arm scaffold only. */
export const START_STATE: Record<Task, string | null> = {
  T1: null,
  T2: "T1",
  T3: "T3-start",
  T4: "T3",
  T5: "T4",
};

export const SPEC_FILE: Record<Task, string> = {
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
}

export const paths = {
  arm: (arm: Arm) => join(ROOT, "arms", arm),
  scaffold: (arm: Arm) => join(ROOT, "arms", arm, "scaffold"),
  reference: (snapshot: string) => join(ROOT, "reference", snapshot),
  spec: (task: Task) => join(ROOT, "specs", SPEC_FILE[task]),
  acceptance: join(ROOT, "acceptance"),
  perf: join(ROOT, "perf", "load.js"),
  schema: join(ROOT, "harness", "run-record.schema.json"),
  results: process.env.TERSA_RESULTS_DIR ? resolve(process.env.TERSA_RESULTS_DIR) : join(ROOT, "results"),
};

export function loadArm(arm: Arm): ArmConfig {
  return JSON.parse(readFileSync(join(paths.arm(arm), "agent.json"), "utf8"));
}

export function isTask(v: string): v is Task {
  return (TASKS as readonly string[]).includes(v);
}
export function isArm(v: string): v is Arm {
  return (ARMS as readonly string[]).includes(v);
}
