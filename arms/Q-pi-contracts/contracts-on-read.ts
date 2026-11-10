/**
 * pi extension for arm Q: contracts delivered where code is read.
 *
 * When a tool result shows source code of one file (pi's `read`, or a single-file `cat`/`sed`/
 * `head`/`tail`/`nl` through `bash`), appends the contracts of
 *   - the functions whose declarations appear in the shown text, and
 *   - the functions called in the shown text that are defined elsewhere (looked up by name),
 * each at most once per session, at most MAX_PER_RESULT per result.
 *
 * Contracts come from contracts.json next to this file: the blind, model-written contracts of
 * arm I (iterations 17–18), keyed by file and function name. Nothing is written to the files,
 * so reads of unchanged code cost nothing extra the second time and edits never see contracts.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findFunctions } from "../../query/src/contracts.ts";

const MAX_PER_RESULT = 12;
const HEADER = "[contracts: from the project's function documentation; not part of the file]";
const READ_CMD = /^\s*(?:cd\s+\S+\s*&&\s*)?(cat|sed|head|tail|nl)\b[^|;&]*$/;
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
  const cmd = String(input?.command ?? "");
  if (!READ_CMD.test(cmd)) return null;
  const cd = /^\s*cd\s+(\S+)\s*&&/.exec(cmd)?.[1];
  const files = [...new Set([...cmd.matchAll(SOURCE)].map((m) => m[1]))];
  if (files.length !== 1) return null;
  return rel(cd ? resolve(cd, files[0]) : files[0]);
}

/** Contracts to append for one tool result; marks them as shown. */
export function contractsFor(
  file: string,
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
  const own = db.byFile[file] ?? {};
  const path = join(workspace, file);
  const defined = new Set<string>();
  if (existsSync(path) && Object.keys(own).length) {
    for (const site of findFunctions(file, readFileSync(path, "utf8"))) {
      defined.add(site.name.split(".").pop()!);
      const decl = site.source.split("\n")[0].trim().slice(0, 60);
      if (decl && text.includes(decl) && own[site.name]) add(file, site.name, own[site.name]);
    }
  }
  for (const m of text.matchAll(CALL)) {
    const name = m[1];
    if (KEYWORDS.has(name) || defined.has(name)) continue;
    const hits = (db.byName.get(name) ?? []).filter((h) => h.file !== file);
    if (hits.length === 1) add(hits[0].file, name, hits[0].contract);
  }
  return out;
}

export default function contractsOnRead(pi: any, ctx: { workspace: string; rawDir: string }) {
  const db = loadDb(join(dirname(fileURLToPath(import.meta.url)), "contracts.json"));
  const shown = new Set<string>();
  let appended = 0;
  pi.on("tool_result", async (event: any) => {
    if (event.isError) return undefined;
    const file = shownFile(event.toolName, event.input, ctx.workspace);
    if (!file) return undefined;
    const text = (event.content ?? []).map((b: any) => (b.type === "text" ? b.text : "")).join("\n");
    const lines = contractsFor(file, text, ctx.workspace, db, shown);
    if (!lines.length) return undefined;
    appended += lines.length;
    return { content: [...event.content, { type: "text", text: `\n${HEADER}\n${lines.join("\n")}` }] };
  });
  pi.on("agent_end", () => console.log(`contracts-on-read: ${appended} contracts appended, ${shown.size} distinct`));
}
