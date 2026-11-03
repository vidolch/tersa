import { defineConfig } from "vitest/config";

// TASK=AB2 runs only that task's tests (tasks are independent; regression is
// covered by the repo's own test suite).
const task = process.env.TASK;
export default defineConfig({
  test: {
    include: task ? [`tests/${task}.test.ts`] : ["tests/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
