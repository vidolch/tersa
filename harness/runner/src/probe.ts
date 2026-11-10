/**
 * Per-run probe of transcripts and final workspaces (as uploaded in the logs-* artifacts).
 *
 *   node src/probe.ts <dir> [--cmd name=regex]... [--file name=relpath:regex]... [--json out.json]
 *
 * --cmd   counts Bash commands matching regex; reports how many, the turn of the first, and whether
 *         any/the last output contained "error" lines (TS errors, test failures).
 * --file  whether the final file at relpath (inside the run's workspace) matches regex.
 * Finds runs as .../<arm>/<task>/run-<n>/transcript.jsonl under <dir>.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

interface CmdStat { count: number; firstTurn: number | null; anyError: boolean; lastError: boolean | null }
export interface Probe { arm: string; task: string; run: number; cmds: Record<string, CmdStat>; files: Record<string, boolean | null> }

const ERROR_LINE = /error TS\d+|\bFAIL\b|✗|AssertionError|Error:/;

export function probeTranscript(lines: string[], cmds: Record<string, RegExp>): Record<string, CmdStat> {
  const out: Record<string, CmdStat> = Object.fromEntries(
    Object.keys(cmds).map((k) => [k, { count: 0, firstTurn: null, anyError: false, lastError: null }]),
  );
  const pending = new Map<string, string>(); // tool_use id -> cmd name
  const seenMsg = new Set<string>();
  let turn = 0;
  for (const line of lines) {
    let m: any;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.parent_tool_use_id) continue;
    if (m.type === "assistant") {
      const id = m.message?.id;
      if (id && !seenMsg.has(id)) { seenMsg.add(id); turn++; }
      for (const b of m.message?.content ?? []) {
        if (b?.type !== "tool_use" || b.name !== "Bash") continue;
        const c = String(b.input?.command ?? "");
        for (const [k, re] of Object.entries(cmds)) {
          if (!re.test(c)) continue;
          out[k].count++;
          out[k].firstTurn ??= turn;
          pending.set(b.id, k);
        }
      }
    } else if (m.type === "user") {
      for (const b of m.message?.content ?? []) {
        if (b?.type !== "tool_result" || !pending.has(b.tool_use_id)) continue;
        const k = pending.get(b.tool_use_id)!;
        const text = typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "");
        const err = ERROR_LINE.test(text);
        out[k].anyError ||= err;
        out[k].lastError = err;
      }
    }
  }
  return out;
}

function findFile(root: string, rel: string, depth = 0): string | null {
  if (existsSync(join(root, rel))) return join(root, rel);
  if (depth > 3) return null;
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(p).isDirectory()) {
      const f = findFile(p, rel, depth + 1);
      if (f) return f;
    }
  }
  return null;
}

function findTranscripts(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules") continue;
    if (statSync(p).isDirectory()) out.push(...findTranscripts(p));
    else if (name === "transcript.jsonl") out.push(p);
  }
  return out;
}

function main() {
  // Options may also come as a JSON array in PROBE_ARGS (used by the anatomy workflow).
  const args = [...process.argv.slice(2), ...(process.env.PROBE_ARGS ? (JSON.parse(process.env.PROBE_ARGS) as string[]) : [])];
  const dir = args[0];
  const cmds: Record<string, RegExp> = {};
  const files: Record<string, { rel: string; re: RegExp }> = {};
  let jsonOut: string | null = null;
  for (let i = 1; i < args.length; i++) {
    const v = args[i + 1] ?? "";
    if (args[i] === "--cmd") { const [k, ...r] = v.split("="); cmds[k] = new RegExp(r.join("=")); i++; }
    else if (args[i] === "--file") { const [k, ...r] = v.split("="); const s = r.join("="); const c = s.indexOf(":"); files[k] = { rel: s.slice(0, c), re: new RegExp(s.slice(c + 1)) }; i++; }
    else if (args[i] === "--json") { jsonOut = v; i++; }
  }
  const rows: Probe[] = [];
  for (const t of findTranscripts(dir)) {
    const parts = relative(dir, t).split(sep);
    const n = parts.length;
    const runDir = dirname(t);
    const row: Probe = {
      arm: parts[n - 4], task: parts[n - 3], run: Number(parts[n - 2].replace("run-", "")),
      cmds: probeTranscript(readFileSync(t, "utf8").split("\n"), cmds),
      files: {},
    };
    for (const [k, f] of Object.entries(files)) {
      const p = findFile(runDir, f.rel);
      row.files[k] = p ? f.re.test(readFileSync(p, "utf8")) : null;
    }
    rows.push(row);
  }
  rows.sort((a, b) => a.arm.localeCompare(b.arm) || a.task.localeCompare(b.task) || a.run - b.run);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
  const ck = Object.keys(cmds), fk = Object.keys(files);
  console.log(`| Arm | Task | Run | ${ck.map((k) => `${k} (count / first turn / last output had errors)`).join(" | ")} | ${fk.join(" | ")} |`);
  console.log(`|---|---|---|${ck.map(() => "---|").join("")}${fk.map(() => "---|").join("")}`);
  for (const r of rows) {
    const c = ck.map((k) => { const s = r.cmds[k]; return s.count ? `${s.count} / ${s.firstTurn} / ${s.lastError ? "yes" : "no"}` : "0"; });
    const f = fk.map((k) => (r.files[k] === null ? "missing" : r.files[k] ? "yes" : "no"));
    console.log(`| ${r.arm} | ${r.task} | ${r.run} | ${c.join(" | ")} | ${f.join(" | ")} |`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
