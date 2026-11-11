/**
 * pi extension for arm Q: contracts delivered where code is read.
 *
 * When a tool result shows source code (pi's `read`, or `bash` output: agents batch several
 * `sed -n`/`cat`/`grep -n` reads into one call), appends the contracts of
 *   - the functions whose declarations appear in the output, for every source file the command
 *     names or the output prefixes as `path:line:` (grep -n), and
 *   - the functions called in the output that are defined elsewhere (looked up by name),
 * each at most once per session, at most MAX_PER_RESULT per result.
 *
 * Contracts come from contracts.<suite>.json next to this file: blind, model-written contracts
 * (`contracts` workflow; for actual, arm I's from iterations 17–18), keyed by file and function name. Nothing is written to the files,
 * so reads of unchanged code cost nothing extra the second time and edits never see contracts.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findFunctions } from "../../query/src/contracts.ts";

const MAX_PER_RESULT = 12;
const HEADER = "[contracts: from the project's function documentation; not part of the file]";
// A command that prints a file: cat/sed -n/head/tail/nl, no in-place edit, no redirection.
const READ_CMD = /^(cat|sed\s+-n|head|tail|nl)\b(?!.*\s-i\b)[^>]*$/;
// What may follow it in a pipe without changing which file is shown.
const PIPE_OK = /^(head|tail|nl|sed\s+-n)\b[^>]*$/;
const SOURCE = /(?:^|\s|['"])((?:\.{0,2}\/)?[\w@.\-/]+\.(?:tsx?|jsx?|mts|cts))\b/g;
const CALL = /\b([A-Za-z_$][\w$]*)\s*\(/g;
const KEYWORDS = new Set(["if", "for", "while", "switch", "return", "function", "catch", "typeof", "new", "await", "import", "super"]);

type Db = Record<string, Record<string, string>>; // file → name → contract

export function loadDb(path: string): { byFile: Db; byName: Map<string, { file: string; contract: string }[]> } {
  const raw = JSON.parse(readFileSync(path, "utf8")) as { files: Record<string, Record<string, string>> };
  const byFile: Db = {};
  const byName = new Map<string, { file: string; contract: string }[]>();
  for (const [file, contracts] of Object.entries(raw.files)) {
    for (const [id, contract] of Object.entries(contracts)) {
      const name = id.replace(/@\d+$/, "");
      (byFile[file] ??= {})[name] = contract;
      const short = name.includes(".") ? name.split(".").pop()! : name;
      byName.set(short, [...(byName.get(short) ?? []), { file, contract }]);
    }
  }
  return { byFile, byName };
}

/** The single source file a tool call showed, if any (workspace-relative). */
export function shownFile(toolName: string, input: any, workspace: string): string | null {
  const rel = (p: string) => {
    const r = relative(workspace, isAbsolute(p) ? p : resolve(workspace, p));
    return r.startsWith("..") ? null : r;
  };
  if (toolName === "read" && typeof input?.path === "string") return rel(input.path);
  if (toolName !== "bash") return null;
  // Agents write `cd <dir>; sed -n 1,80p a.ts` or `cd <dir> && cat a.ts | head -50`.
  let cwd = workspace;
  const rest: string[] = [];
  for (const seg of String(input?.command ?? "").split(/\s*(?:&&|;)\s*/).map((x) => x.trim()).filter(Boolean)) {
    const cd = /^cd\s+(\S+)$/.exec(seg);
    if (cd) cwd = resolve(cwd, cd[1].replace(/^['"]|['"]$/g, ""));
    else rest.push(seg);
  }
  if (rest.length !== 1) return null;
  const [first, ...pipes] = rest[0].replace(/\s*2>\s*\/dev\/null/g, "").split(/\s*\|\s*/);
  if (!READ_CMD.test(first) || !pipes.every((p) => PIPE_OK.test(p))) return null;
  const files = [...new Set([...first.matchAll(SOURCE)].map((m) => m[1]))];
  if (files.length !== 1) return null;
  return rel(resolve(cwd, files[0]));
}

/**
 * Every source file a tool call may have shown (workspace-relative): the read tool's path, or for
 * bash, the files named in any segment (following `cd`) plus `path:line:` prefixes in the output.
 * Edits are excluded: a command that writes a file (sed -i, >, heredoc scripts) shows nothing.
 */
export function shownFiles(toolName: string, input: any, workspace: string, output: string): string[] {
  const rel = (p: string) => {
    const r = relative(workspace, isAbsolute(p) ? p : resolve(workspace, p));
    return r.startsWith("..") ? null : r;
  };
  if (toolName === "read") return typeof input?.path === "string" ? [rel(input.path)].filter(Boolean) as string[] : [];
  if (toolName !== "bash") return [];
  const cmd = String(input?.command ?? "");
  if (/<<\s*['"]?\w+/.test(cmd)) return []; // heredoc: a script or a file write, not a read
  let cwd = workspace;
  const found = new Set<string>();
  for (const seg of cmd.split(/\s*(?:&&|;|\n)\s*/).map((x) => x.trim()).filter(Boolean)) {
    const cd = /^cd\s+(\S+)$/.exec(seg);
    if (cd) { cwd = resolve(cwd, cd[1].replace(/^['"]|['"]$/g, "")); continue; }
    if (/\s-i\b|>\s*[\w./]/.test(seg.replace(/2>\s*\/dev\/null/g, ""))) continue;
    for (const m of seg.matchAll(SOURCE)) { const r = rel(resolve(cwd, m[1])); if (r) found.add(r); }
  }
  for (const line of output.split("\n")) {
    const m = /^((?:\.{0,2}\/)?[\w@.\-/]+\.(?:tsx?|jsx?|mts|cts)):\d+[:-]/.exec(line);
    if (m) { const r = rel(resolve(cwd, m[1])); if (r) found.add(r); }
  }
  return [...found];
}

/** Contracts to append for one tool result; marks them as shown. */
export function contractsFor(
  fileOrFiles: string | string[],
  text: string,
  workspace: string,
  db: ReturnType<typeof loadDb>,
  shown: Set<string>,
): string[] {
  const out: string[] = [];
  const add = (f: string, name: string, contract: string) => {
    const key = `${f}#${name}`;
    if (shown.has(key) || out.length >= MAX_PER_RESULT) return;
    shown.add(key);
    out.push(`- ${name} (${f}): ${contract}`);
  };
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  const defined = new Set<string>();
  for (const file of files) {
    const own = db.byFile[file] ?? {};
    const path = join(workspace, file);
    if (!existsSync(path) || !Object.keys(own).length) continue;
    for (const site of findFunctions(file, readFileSync(path, "utf8"))) {
      defined.add(site.name.split(".").pop()!);
      const decl = site.source.split("\n")[0].trim().slice(0, 60);
      if (decl && text.includes(decl) && own[site.name]) add(file, site.name, own[site.name]);
    }
  }
  for (const m of text.matchAll(CALL)) {
    const name = m[1];
    if (KEYWORDS.has(name) || defined.has(name)) continue;
    const hits = (db.byName.get(name) ?? []).filter((h) => !files.includes(h.file));
    if (hits.length === 1) add(hits[0].file, name, hits[0].contract);
  }
  return out;
}

export default function contractsOnRead(pi: any, ctx: { workspace: string; rawDir: string; suite: string; armDir?: string }) {
  // The arm's own contracts.<suite>.json (arm Q2 shares this extension with a filtered set).
  const db = loadDb(join(ctx.armDir ?? dirname(fileURLToPath(import.meta.url)), `contracts.${ctx.suite}.json`));
  const shown = new Set<string>();
  let appended = 0;
  pi.on("tool_result", async (event: any) => {
    if (event.isError) return undefined;
    const text = (event.content ?? []).map((b: any) => (b.type === "text" ? b.text : "")).join("\n");
    const files = shownFiles(event.toolName, event.input, ctx.workspace, text);
    if (!files.length) return undefined;
    const lines = contractsFor(files, text, ctx.workspace, db, shown);
    if (!lines.length) return undefined;
    appended += lines.length;
    return { content: [...event.content, { type: "text", text: `\n${HEADER}\n${lines.join("\n")}` }] };
  });
  pi.on("agent_end", () => console.log(`contracts-on-read: ${appended} contracts appended, ${shown.size} distinct`));
}
