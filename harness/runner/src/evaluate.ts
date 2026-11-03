import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { paths, type Arm, type Suite, type Task } from "./config.ts";

export interface AcceptanceResult {
  passed: boolean;
  rules: Record<string, boolean>;
}

export interface PerfResult {
  passed: boolean;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  rps: number;
  errorRate: number;
}

/** "T2 R8 + R9" → ["T2 R8", "T2 R9"]; works for any task id like AB3. */
function ruleKeys(title: string): string[] {
  const m = title.match(/^([A-Z]+\d+)\s+(R\d+(?:\s*\+\s*R\d+)*)$/);
  if (!m) return [];
  return m[2].split("+").map((r) => `${m[1]} ${r.trim()}`);
}

function mergeVitestReport(file: string, rules: Record<string, boolean>): boolean {
  if (!existsSync(file)) return false;
  const report = JSON.parse(readFileSync(file, "utf8"));
  for (const tr of report.testResults ?? []) {
    // A file that fails as a whole (e.g. the service never starts) reports its
    // tests as skipped. Those count as failed, never as absent.
    const fileFailed = tr.status === "failed";
    for (const a of tr.assertionResults ?? []) {
      const ok = a.status === "passed";
      const counts = a.status === "passed" || a.status === "failed" || (fileFailed && a.status !== "todo");
      if (!counts) continue;
      for (const key of ruleKeys(a.ancestorTitles?.[0] ?? "")) {
        rules[key] = (rules[key] ?? true) && ok;
      }
    }
  }
  return true;
}

export function runAcceptance(task: Task, workspace: string, arm: Arm, outDir: string): AcceptanceResult {
  const r = spawnSync(join(paths.acceptance, "run.sh"), [task, workspace, arm, outDir], {
    encoding: "utf8",
    timeout: 15 * 60_000,
  });
  writeFileSync(join(outDir, "acceptance.log"), (r.stdout ?? "") + (r.stderr ?? ""));

  const rules: Record<string, boolean> = {};
  const haveDefault = mergeVitestReport(join(outDir, "acceptance-default.json"), rules);
  if (task === "T4" || task === "T5") mergeVitestReport(join(outDir, "acceptance-memory.json"), rules);
  const structure = join(outDir, "structure.json");
  if (existsSync(structure)) {
    const s = JSON.parse(readFileSync(structure, "utf8"));
    rules[s.rule] = s.passed;
  }
  const passed = r.status === 0 && haveDefault && Object.values(rules).every(Boolean);
  return { passed, rules };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      if (a && typeof a === "object") s.close(() => resolve(a.port));
      else reject(new Error("no port"));
    });
  });
}

export function k6Available(): boolean {
  return spawnSync("k6", ["version"], { stdio: "ignore" }).status === 0;
}

/** Runs perf/load.js against a fresh instance. Returns null if k6 is not installed. */
export async function runPerf(workspace: string, outDir: string): Promise<PerfResult | null> {
  if (!k6Available()) return null;
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn("npm start", {
    cwd: workspace,
    shell: true,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PORT: String(port), DATA_DIR: mkdtempSync(join(tmpdir(), "tersa-perf-")) },
  });
  try {
    const deadline = Date.now() + 15_000;
    for (;;) {
      try {
        if ((await fetch(`${base}/healthz`)).status === 200) break;
      } catch {}
      if (Date.now() > deadline) throw new Error("service not healthy for perf");
      await new Promise((r) => setTimeout(r, 100));
    }
    const summary = join(outDir, "perf-summary.json");
    const k6 = spawnSync("k6", ["run", "--quiet", "-e", `BASE_URL=${base}`, "--summary-export", summary, paths.perf], {
      encoding: "utf8",
      timeout: 5 * 60_000,
    });
    writeFileSync(join(outDir, "perf.log"), (k6.stdout ?? "") + (k6.stderr ?? ""));
    const m = JSON.parse(readFileSync(summary, "utf8")).metrics;
    const dur = m["http_req_duration{phase:measure}"] ?? m.http_req_duration;
    const failed = m["http_req_failed{phase:measure}"] ?? m.http_req_failed;
    return {
      passed: k6.status === 0, // k6 exits 99 when a threshold fails
      p50Ms: dur["p(50)"],
      p95Ms: dur["p(95)"],
      p99Ms: dur["p(99)"],
      rps: m.http_reqs?.rate ?? 0,
      errorRate: failed?.value ?? failed?.rate ?? 0,
    };
  } finally {
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {}
  }
}

/** Actual Budget suite: suites/actual/scripts/evaluate.sh (regression + black-box acceptance). */
export function runSuiteAcceptance(suite: Suite, task: Task, workspace: string, outDir: string): AcceptanceResult {
  const script = join(paths.suite(suite), "scripts", "evaluate.sh");
  const r = spawnSync(script, [task, workspace, outDir], { encoding: "utf8", timeout: 30 * 60_000 });
  writeFileSync(join(outDir, "evaluate.log"), (r.stdout ?? "") + (r.stderr ?? ""));
  const rules: Record<string, boolean> = {};
  const haveAcceptance = mergeVitestReport(join(outDir, "acceptance-default.json"), rules);
  const regFile = join(outDir, "regression.json");
  rules[`${task} regression`] = existsSync(regFile) && JSON.parse(readFileSync(regFile, "utf8")).passed === true;
  const passed = r.status === 0 && haveAcceptance && Object.values(rules).every(Boolean);
  return { passed, rules };
}

export interface ReadingStats {
  filesRead: number;
  readChars: number;
  relevantChars: number;
  coreChars: number;
  /** Share of Read output that came from ground-truth relevant files. */
  precision: number;
  /** Share of core files the agent read at least once. */
  coreRecall: number;
  /** Total Read output chars ÷ 4, an estimate. */
  readTokens: number;
}

/** P1 metric: how much of what the agent read was relevant (suites with task.json ground truth). */
export function readingStats(
  suite: Suite,
  task: Task,
  workspace: string,
  reads: Record<string, number>,
): ReadingStats | null {
  const tj = join(paths.suite(suite), "tasks", task, "task.json");
  if (!existsSync(tj)) return null;
  const { relevant } = JSON.parse(readFileSync(tj, "utf8"));
  const core = new Set<string>(relevant.core);
  const all = new Set<string>([...relevant.core, ...relevant.supporting]);
  const rel = (p: string) => (p.startsWith(workspace + "/") ? p.slice(workspace.length + 1) : p);
  let readChars = 0, relevantChars = 0, coreChars = 0;
  const coreSeen = new Set<string>();
  for (const [abs, chars] of Object.entries(reads)) {
    const p = rel(abs);
    readChars += chars;
    if (all.has(p)) relevantChars += chars;
    if (core.has(p)) {
      coreChars += chars;
      coreSeen.add(p);
    }
  }
  return {
    filesRead: Object.keys(reads).length,
    readChars,
    relevantChars,
    coreChars,
    precision: readChars ? relevantChars / readChars : 0,
    coreRecall: core.size ? coreSeen.size / core.size : 0,
    readTokens: Math.round(readChars / 4),
  };
}
