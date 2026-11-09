// Aggregates results/<arm>/<task>/run-*.json into results/summary.md.
// Primary metric: cost per passing task = Σ cost ÷ passing runs.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ARMS, modelOptionsLabel, paths, TASKS } from "./config.ts";

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "–");

const rows: string[] = [];
const header =
  "| Arm | Task | Model | Runs | Pass | Cost/pass $ | Median $ | Median input tok | Median output tok | Median tool calls | Median repeat reads | Median read precision | Median read tok |";
rows.push(header, header.replace(/[^|]/g, "-"));

for (const arm of ARMS) {
  for (const task of TASKS) {
    const dir = join(paths.results, arm, task);
    if (!existsSync(dir)) continue;
    const recs = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
    const byModel = new Map<string, any[]>();
    for (const r of recs) {
      const key = r.model + (modelOptionsLabel(r.modelOptions) ? ` (${modelOptionsLabel(r.modelOptions)})` : "");
      byModel.set(key, [...(byModel.get(key) ?? []), r]);
    }
    for (let [model, recs] of byModel) {
    // Infrastructure crashes (provider errors) are not agent failures: shown, not scored.
    const crashed = recs.filter((r) => r.stopReason === "error_agent_crash").length;
    recs = recs.filter((r) => r.stopReason !== "error_agent_crash");
    // Network use without the provider-only policy may have leaked the answer: shown, not scored.
    const contaminated = (r: any) => (r.agent.networkCommands ?? 0) > 0 && r.network?.policy !== "provider-only";
    const invalid = recs.filter(contaminated).length;
    recs = recs.filter((r) => !contaminated(r));
    if (!recs.length) {
      rows.push(`| ${arm} | ${task} | ${model} | 0 (+${crashed} crashed) | – | – | – | – | – | – | – | – | – |`);
      continue;
    }
    const pass = recs.filter((r) => r.acceptance.passed && (r.perf?.passed ?? true));
    const cost = recs.reduce((n, r) => n + r.costUsd, 0);
    const input = recs.map((r) => r.usage.inputUncached + r.usage.cacheRead + r.usage.cacheWrite);
    rows.push(
      `| ${arm} | ${task} | ${model} | ${recs.length}${crashed ? ` (+${crashed} crashed)` : ""}${invalid ? ` (+${invalid} invalid)` : ""} | ${pass.length} | ${pass.length ? fmt(cost / pass.length, 3) : "∞"} | ${fmt(median(recs.map((r) => r.costUsd)), 3)} | ${fmt(median(input))} | ${fmt(median(recs.map((r) => r.usage.output)))} | ${fmt(median(recs.map((r) => r.agent.toolCalls)))} | ${fmt(median(recs.map((r) => r.agent.repeatReads ?? 0)))} | ${recs[0].reading ? fmt(median(recs.map((r) => r.reading.precision * 100))) + "%" : "–"} | ${recs[0].reading ? fmt(median(recs.map((r) => r.reading.readTokens))) : "–"} |`,
    );
    }
  }
}

const out = `# Results\n\nGenerated ${new Date().toISOString()}. Independent runs only (chained runs excluded). Runs that crashed on a provider error ("+N crashed") and runs that used the network without the provider-only policy ("+N invalid") are listed but not scored.\n\n${rows.join("\n")}\n`;
mkdirSync(paths.results, { recursive: true });
writeFileSync(join(paths.results, "summary.md"), out);
console.log(out);
