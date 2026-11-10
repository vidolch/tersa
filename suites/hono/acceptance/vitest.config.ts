import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [`tests/${process.env.TASK ?? "*"}.test.ts`],
    testTimeout: 30_000,
  },
});
