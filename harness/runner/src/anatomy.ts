/**
 * Where a run's tokens go, from its transcript (transcript.jsonl written by agent.ts).
 *
 *   node src/anatomy.ts <dir with transcripts> [--price claude-haiku-5-5] [--json out.json]
 *
 * Finds every .../<arm>/<task>/run-<n>/transcript.jsonl under <dir> and reports, per arm and task:
 *  - start context: size of the first request (system prompt + tool definitions + task prompt);
 *  - output split by kind: thinking, text, shell edits, other shell, Edit/Write inputs, other tool inputs
 *    (each request's output tokens are shared out by the characters of its content blocks);
 *  - carried input split into: start context re-sent, the agent's own earlier output, tool results.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { SHELL_EDIT } from "./metrics.ts";

type Kind = "thinking" | "text" | "shellEdit" | "shell" | "editTool" | "otherTool";
const KINDS: Kind[] = ["thinking", "text", "shellEdit", "shell", "editTool", "otherTool"];

export interface Anatomy {
  arm: string;
  task: string;
  run: number;
  requests: number;
  startContext: number;
  input: number; // all input tokens (uncached + cache write + cache read)
  output: number;
  outputByKind: Record<Kind, number>;
  carried: { start: number; ownOutput: number; toolResults: number };
}

function blockKind(b: any): Kind | null {
  if (b?.type === "thinking" || b?.type === "redacted_thinking") return "thinking";
  if (b?.type === "text") return "text";
  if (b?.type !== "tool_use") return null;
  if (b.name === "Bash") return SHELL_EDIT.test(String(b.input?.command ?? "")) ? "shellEdit" : "shell";
  if (b.name === "Edit" || b.name === "Write" || b.name === "MultiEdit") return "editTool";
  return "otherTool";
}

function blockChars(b: any): number {
  if (b?.type === "thinking") return String(b.thinking ?? "").length;
  if (b?.type === "redacted_thinking") return String(b.data ?? "").length;
  if (b?.type === "text") return String(b.text ?? "").length;
  if (b?.type === "tool_use") return JSON.stringify(b.input ?? {}).length + String(b.name).length;
  return 0;
}

export function analyze(lines: string[], id: { arm: string; task: string; run: number }): Anatomy {
  // Requests in order: input from message_start, output from the last message_delta.
  const reqs: { input: number; output: number; id?: string }[] = [];
  // Assistant content per message id, in order of appearance.
  const content = new Map<string, any[]>();
  for (const line of lines) {
    let m: any;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.type === "stream_event" && !m.parent_tool_use_id) {
      const e = m.event;
      if (e?.type === "message_start") {
        const u = e.message?.usage ?? {};
        reqs.push({
          input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
          output: u.output_tokens ?? 0,
          id: e.message?.id,
        });
      } else if (e?.type === "message_delta" && reqs.length) {
        const o = e.usage?.output_tokens;
        if (typeof o === "number") reqs[reqs.length - 1].output = o;
      }
    } else if (m.type === "assistant" && !m.parent_tool_use_id) {
      const mid = m.message?.id ?? `anon-${content.size}`;
      const list = content.get(mid) ?? [];
      list.push(...(m.message?.content ?? []));
      content.set(mid, list);
    }
  }
  const outputByKind = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;
  const carried = { start: 0, ownOutput: 0, toolResults: 0 };
  const startContext = reqs[0]?.input ?? 0;
  let ownSoFar = 0; // earlier non-thinking output still in context
  for (const r of reqs) {
    // Re-sent context = start + own earlier output + tool results (the remainder).
    carried.start += Math.min(startContext, r.input);
    const own = Math.min(ownSoFar, Math.max(0, r.input - startContext));
    carried.ownOutput += own;
    carried.toolResults += Math.max(0, r.input - startContext - own);
    const blocks = (r.id && content.get(r.id)) || [];
    const chars: Partial<Record<Kind, number>> = {};
    let total = 0;
    for (const b of blocks) {
      const k = blockKind(b);
      if (!k) continue;
      const c = blockChars(b);
      chars[k] = (chars[k] ?? 0) + c;
      total += c;
    }
    for (const k of KINDS) if (total) outputByKind[k] += (r.output * (chars[k] ?? 0)) / total;
    if (!total) outputByKind.text += r.output;
    // Thinking from earlier turns is dropped from context by the API; the rest stays.
    ownSoFar += total ? (r.output * (total - (chars.thinking ?? 0))) / total : r.output;
  }
  return {
    ...id,
    requests: reqs.length,
    startContext,
    input: reqs.reduce((a, r) => a + r.input, 0),
    output: reqs.reduce((a, r) => a + r.output, 0),
    outputByKind,
    carried,
  };
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
  const args = process.argv.slice(2);
  const dir = args[0];
  if (!dir) throw new Error("usage: anatomy.ts <dir> [--price model] [--json out.json]");
  const priceModel = args.includes("--price") ? args[args.indexOf("--price") + 1] : "claude-haiku-5-5";
  const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
  const prices = JSON.parse(readFileSync(new URL("../../prices.json", import.meta.url), "utf8"));
  const p = prices[priceModel] ?? prices.models?.[priceModel];
  const hit = p?.inputHit ?? 0.01;
  const outP = p?.output ?? 0.5;

  const rows: Anatomy[] = [];
  for (const f of findTranscripts(dir)) {
    const parts = relative(dir, f).split(sep);
    const n = parts.length;
    const run = Number(parts[n - 2]?.replace("run-", ""));
    rows.push(analyze(readFileSync(f, "utf8").split("\n"), { arm: parts[n - 4], task: parts[n - 3], run }));
  }
  rows.sort((a, b) => (a.arm + a.task + String(a.run).padStart(3, "0")).localeCompare(b.arm + b.task + String(b.run).padStart(3, "0")));
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));

  const k = (x: number) => `${(x / 1000).toFixed(1)}k`;
  const pct = (x: number, t: number) => `${t ? Math.round((x / t) * 100) : 0}%`;
  console.log(`Token anatomy (${rows.length} runs; carried input priced as cache reads at $${hit}/M, output at $${outP}/M)\n`);
  console.log("| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const groups = new Map<string, Anatomy[]>();
  for (const r of rows) groups.set(`${r.arm}|${r.task}`, [...(groups.get(`${r.arm}|${r.task}`) ?? []), r]);
  const all = new Map<string, Anatomy[]>();
  for (const r of rows) all.set(r.arm, [...(all.get(r.arm) ?? []), r]);
  const line = (arm: string, task: string, g: Anatomy[]) => {
    const mean = (f: (a: Anatomy) => number) => g.reduce((s, a) => s + f(a), 0) / g.length;
    const out = mean((a) => a.output);
    const car = mean((a) => a.carried.start + a.carried.ownOutput + a.carried.toolResults);
    console.log(
      `| ${arm} | ${task} | ${g.length} | ${mean((a) => a.requests).toFixed(0)} | ${k(mean((a) => a.startContext))} | ${k(out)} | ` +
        KINDS.map((kk) => pct(mean((a) => a.outputByKind[kk]), out)).join(" | ") +
        ` | ${pct(mean((a) => a.carried.start), car)} | ${pct(mean((a) => a.carried.ownOutput), car)} | ${pct(mean((a) => a.carried.toolResults), car)} |`,
    );
  };
  for (const [key, g] of groups) line(key.split("|")[0], key.split("|")[1], g);
  for (const [arm, g] of all) line(arm, "all", g);

  console.log("\nShare of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):\n");
  console.log("| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |");
  console.log("|---|---|---|---|---|");
  for (const [arm, g] of all) {
    const s = (f: (a: Anatomy) => number) => g.reduce((t, a) => t + f(a), 0);
    const o = s((a) => a.output) * outP, cs = s((a) => a.carried.start) * hit, co = s((a) => a.carried.ownOutput) * hit, ct = s((a) => a.carried.toolResults) * hit;
    const t = o + cs + co + ct;
    console.log(`| ${arm} | ${pct(o, t)} | ${pct(cs, t)} | ${pct(co, t)} | ${pct(ct, t)} |`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
