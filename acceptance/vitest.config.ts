import { defineConfig } from "vitest/config";

// TASK=T3 runs the T1, T2 and T3 suites (rules are additive across tasks).
const ORDER = ["T1", "T2", "T3", "T4", "T5"];
const task = process.env.TASK ?? "T5";
const upTo = ORDER.indexOf(task);
if (upTo < 0) throw new Error(`Unknown TASK=${task}`);

export default defineConfig({
  test: {
    include: ORDER.slice(0, upTo + 1).map((t) => `tests/${t}.test.ts`),
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
