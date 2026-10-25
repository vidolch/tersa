// Aggregates results/<arm>/<task>/run-*.json into results/summary.md.
// Primary metric: cost per passing task = Σ cost ÷ passing runs.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ARMS, paths, TASKS } from "./config.ts";

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "–");

const rows: string[] = [];
const header =
  "| Arm | Task | Runs | Pass | Cost/pass $ | Median $ | Median input tok | Median output tok | Median tool calls | Median repeat reads |";
rows.push(header, header.replace(/[^|]/g, "-"));

for (const arm of ARMS) {
  for (const task of TASKS) {
    const dir = join(paths.results, arm, task);
    if (!existsSync(dir)) continue;
    const recs = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
    if (!recs.length) continue;
    const pass = recs.filter((r) => r.acceptance.passed && (r.perf?.passed ?? true));
    const cost = recs.reduce((n, r) => n + r.costUsd, 0);
    const input = recs.map((r) => r.usage.inputUncached + r.usage.cacheRead + r.usage.cacheWrite);
    rows.push(
      `| ${arm} | ${task} | ${recs.length} | ${pass.length} | ${pass.length ? fmt(cost / pass.length, 3) : "∞"} | ${fmt(median(recs.map((r) => r.costUsd)), 3)} | ${fmt(median(input))} | ${fmt(median(recs.map((r) => r.usage.output)))} | ${fmt(median(recs.map((r) => r.agent.toolCalls)))} | ${fmt(median(recs.map((r) => r.agent.repeatReads ?? 0)))} |`,
    );
  }
}

const out = `# Results\n\nGenerated ${new Date().toISOString()}. Independent runs only (chained runs excluded).\n\n${rows.join("\n")}\n`;
writeFileSync(join(paths.results, "summary.md"), out);
console.log(out);
