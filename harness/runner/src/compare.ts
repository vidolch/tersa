// Compares groups of run records, per task. Used for docs/iterations.md so
// every table there can be regenerated from the committed records.
//
// Usage: node src/compare.ts <label>=<dir>[@runs][,<dir>[@runs]...] ... [--suite actual]
//   <dir> holds <task>/run-<n>.json (e.g. results/A-ts-baseline or
//   results/archive/2026-11-03-armB-v1-steered/B-ts-query), relative to the repo root.
//   @runs keeps only those run numbers, e.g. results/A-ts-baseline@1-6 or @7,8.
//   --suite keeps only records of that suite; --model only records of that model.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./config.ts";

const args = process.argv.slice(2);
const suiteIdx = args.indexOf("--suite");
const suite = suiteIdx >= 0 ? args[suiteIdx + 1] : null;
const modelIdx = args.indexOf("--model");
const model = modelIdx >= 0 ? args[modelIdx + 1] : null;
function parseRuns(spec: string | undefined): Set<number> | null {
  if (!spec) return null;
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const [a, b] = part.split("-").map(Number);
    for (let n = a; n <= (b ?? a); n++) out.add(n);
  }
  return out;
}
const groups = args
  .filter((a, i) => a.includes("=") && i !== suiteIdx + 1 && i !== modelIdx + 1)
  .map((a) => {
    const [label, spec] = a.split("=");
    // "dirA@1-6,dirB" → [{dir, runs}]; a comma inside @runs belongs to the runs
    const dirs = spec.split(/,(?=[^@,]*(?:@|$))/).map((d) => {
      const [dir, runs] = d.split("@");
      return { dir, runs: parseRuns(runs) };
    });
    return { label, dirs };
  });
if (!groups.length) {
  console.error("usage: compare.ts <label>=<dir>[@runs] ... [--suite actual]");
  process.exit(2);
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const k = (n: number) => (Number.isFinite(n) ? `${Math.round(n / 1000)}k` : "–");
const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : "–");
const usd = (n: number) => (Number.isFinite(n) ? `$${n.toFixed(3)}` : "–");

function load({ dir, runs }: { dir: string; runs: Set<number> | null }): any[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out: any[] = [];
  for (const task of readdirSync(abs)) {
    const tdir = join(abs, task);
    if (!/^[A-Z]+\d+$/.test(task)) continue;
    for (const f of readdirSync(tdir).filter((f) => /^run-\d+\.json$/.test(f))) {
      const r = JSON.parse(readFileSync(join(tdir, f), "utf8"));
      if (runs && !runs.has(r.run)) continue;
      if (suite && (r.suite ?? "urlshort") !== suite) continue;
      if (model && r.model !== model) continue;
      if (r.stopReason === "error_agent_crash") continue;
      out.push(r);
    }
  }
  return out;
}

const tasks = new Set<string>();
const data = groups.map((g) => {
  const recs = g.dirs.flatMap(load);
  recs.forEach((r) => tasks.add(r.task));
  return { ...g, recs };
});

const header =
  "| Task | Group | Runs | Pass | Median cost | Median turns | Median input | Median reading | Read precision | Query calls | Redirects | Read share of carried |";
console.log(header);
console.log(header.replace(/[^|]/g, "-"));
for (const task of [...tasks].sort()) {
  for (const g of data) {
    const rs = g.recs.filter((r) => r.task === task);
    if (!rs.length) continue;
    const pass = rs.filter((r) => r.acceptance.passed).length;
    const carriedShare = rs
      .filter((r) => r.toolCost)
      .map((r) => {
        const all = Object.values<any>(r.toolCost).reduce((n, v) => n + v.carriedTokens, 0);
        return all ? (r.toolCost.Read?.carriedTokens ?? 0) / all : 0;
      });
    const queryCalls = rs.map((r) =>
      Object.entries<number>(r.agent.toolCallsByName ?? {})
        .filter(([n]) => n.startsWith("mcp__"))
        .reduce((a, [, v]) => a + v, 0),
    );
    console.log(
      `| ${task} | ${g.label} | ${rs.length} | ${pass}/${rs.length} | ${usd(median(rs.map((r) => r.costUsd)))} | ${median(rs.map((r) => r.agent.turns))} | ${(median(rs.map((r) => r.usage.inputUncached + r.usage.cacheRead)) / 1e6).toFixed(2)}M | ${k(median(rs.map((r) => r.reading?.readTokens ?? NaN)))} | ${pct(median(rs.map((r) => r.reading?.precision ?? NaN)))} | ${median(queryCalls)} | ${median(rs.map((r) => r.steering?.redirects ?? 0))} | ${carriedShare.length ? pct(median(carriedShare)) : "–"} |`,
    );
  }
}
