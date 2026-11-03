// Query engine: resolves names, runs the four tools and renders the text view
// defined in CONTRACT.md section 3.
import ts from "typescript";
import { join } from "node:path";
import { CAPABILITIES, Index, type FileEntry, type Sym } from "./indexer.ts";

export const CONTRACT_VERSION = "v1.2";
const MAX_RESPONSE = 60_000;
const MAX_DEPS = 40;

type Resolved = { kind: "ok"; sym: Sym } | { kind: "ambiguous"; matches: Sym[] } | { kind: "missing"; suggestions: string[] };

/** Levenshtein distance, capped for speed. */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 8) return 99;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Collects output, enforcing within-response dedupe and the size cap. */
class View {
  private parts: string[] = [];
  private size = 0;
  private omitted: string[] = [];
  readonly shownInResponse = new Set<string>();

  add(text: string, label: string): boolean {
    if (this.size + text.length > MAX_RESPONSE) {
      this.omitted.push(label);
      return false;
    }
    this.parts.push(text);
    this.size += text.length;
    return true;
  }

  toString(): string {
    const notice = this.omitted.length
      ? `\n[response cut at ${MAX_RESPONSE} chars; omitted: ${this.omitted.join(", ")}. Ask for them in a separate call.]\n`
      : "";
    return (this.parts.join("\n").trimEnd() || "(no results)") + notice;
  }
}

export class Engine {
  readonly index: Index;
  /** Session dedupe: `${id}@${hash}` of every body already returned. */
  private shown = new Set<string>();

  constructor(root: string) {
    this.index = new Index(root);
  }

  // ---- name resolution (contract section 4) ----

  resolve(raw: string): Resolved {
    const name = raw.trim();
    const ix = this.index;
    const rank = (list: Sym[]) => [...list].sort((a, b) => Number(a.isTest) - Number(b.isTest) || a.path.localeCompare(b.path));

    // path:line
    const atLine = name.match(/^(.+\.[a-z]+):(\d+)$/i);
    if (atLine) {
      const f = this.fileBySuffix(atLine[1]);
      if (f.length === 1) {
        const off = ix.offsetOfLine(f[0], Number(atLine[2]));
        const lineEnd = ix.offsetOfLine(f[0], Number(atLine[2]) + 1) - 1;
        const inner = f[0].symbols
          .filter((s) => s.pos <= Math.max(off, lineEnd) && off < s.endPos)
          .sort((a, b) => a.endPos - a.pos - (b.endPos - b.pos))[0];
        if (inner) return { kind: "ok", sym: inner };
      }
      return { kind: "missing", suggestions: f.length > 1 ? f.slice(0, 5).map((x) => x.path) : [] };
    }

    // path:Name
    const inFile = name.match(/^(.+\.[a-z]+):(.+)$/i);
    if (inFile) {
      const files = this.fileBySuffix(inFile[1]);
      const want = inFile[2];
      const hits = files.flatMap((f) => f.symbols.filter((s) => s.qualifiedName === want || s.name === want));
      if (hits.length === 1) return { kind: "ok", sym: hits[0] };
      if (hits.length > 1) {
        const exact = hits.filter((s) => s.qualifiedName === want);
        if (exact.length === 1) return { kind: "ok", sym: exact[0] };
        return { kind: "ambiguous", matches: rank(hits) };
      }
      const cands = files.flatMap((f) => f.symbols.map((s) => s.qualifiedName));
      return { kind: "missing", suggestions: this.nearest(want, cands) };
    }

    // Class.member
    if (name.includes(".") && !name.includes("/")) {
      const [owner, ...rest] = name.split(".");
      const member = rest.join(".");
      const hits = ix.symbolsNamed(member).filter((s) => s.qualifiedName === `${owner}.${member}`);
      if (hits.length === 1) return { kind: "ok", sym: hits[0] };
      if (hits.length > 1) return { kind: "ambiguous", matches: rank(hits) };
    }

    // Name
    const hits = ix.symbolsNamed(name);
    if (hits.length === 1) return { kind: "ok", sym: hits[0] };
    if (hits.length > 1) {
      const nonTest = hits.filter((s) => !s.isTest);
      if (nonTest.length === 1) return { kind: "ok", sym: nonTest[0] };
      return { kind: "ambiguous", matches: rank(hits) };
    }
    return { kind: "missing", suggestions: this.nearest(name, [...ix.names()]) };
  }

  private fileBySuffix(p: string): FileEntry[] {
    const clean = p.replace(/^\.?\//, "");
    const exact = this.index.file(clean);
    if (exact) return [exact];
    return this.index.allFiles().filter((f) => f.path === clean || f.path.endsWith("/" + clean));
  }

  private nearest(name: string, candidates: string[]): string[] {
    const lower = name.toLowerCase();
    const scored: [string, number][] = [];
    const seen = new Set<string>();
    for (const c of candidates) {
      if (seen.has(c)) continue;
      seen.add(c);
      const cl = c.toLowerCase();
      // substring hits only count when the shorter side is a meaningful word
      const sub = (cl.includes(lower) && lower.length >= 3) || (lower.includes(cl) && cl.length >= Math.max(4, lower.length - 3));
      const d = sub ? 0.5 : distance(lower, cl);
      if (d <= Math.max(2, Math.floor(name.length / 3))) scored.push([c, d]);
    }
    return scored
      .sort((a, b) => a[1] - b[1] || a[0].length - b[0].length)
      .slice(0, 5)
      .map(([c]) => c);
  }

  // ---- rendering helpers ----

  private header(s: Sym): string {
    return `### ${s.qualifiedName} · ${s.kind} · ${s.path}:${s.start}-${s.end} · #${s.hash}${s.isTest ? " · test" : ""} · to edit: Read offset ${s.start} limit ${s.end - s.start + 1}`;
  }

  private body(s: Sym, maxLines: number): string {
    const f = this.index.file(s.path)!;
    const width = String(s.end).length;
    const lines: string[] = [];
    const last = Math.min(s.end, s.start + maxLines - 1);
    for (let n = s.start; n <= last; n++) lines.push(`${String(n).padStart(width)}│${this.index.lineText(f, n)}`);
    if (last < s.end) {
      lines.push(
        `… ${s.end - last} more lines (${s.path}:${last + 1}-${s.end}). Pass maxLines or read that range for the rest.`,
      );
    }
    return lines.join("\n");
  }

  private short(path: string): string {
    return path.split("/").slice(-2).join("/");
  }

  private ambiguousText(raw: string, matches: Sym[]): string {
    return `ambiguous: ${raw} matches ${matches.length} symbols; use a qualified name:\n${matches
      .slice(0, 15)
      .map((m) => `  ${m.path}:${m.qualifiedName} — ${m.kind}, line ${m.start}${m.isTest ? " (test)" : ""}`)
      .join("\n")}`;
  }

  private missingText(raw: string, suggestions: string[]): string {
    return `not found: ${raw}${suggestions.length ? `\n  did you mean: ${suggestions.join(", ")}` : ""}`;
  }

  /** In-repo symbols a body uses (resolved definitions), excluding itself and its own members. */
  private deps(s: Sym): Sym[] {
    const svc = this.index.service(s.path);
    const f = this.index.file(s.path);
    if (!svc || !f) return [];
    const absPath = join(this.index.root, s.path);
    const found = new Map<string, Sym>();
    const visit = (node: ts.Node) => {
      if (found.size >= MAX_DEPS) return;
      if (ts.isIdentifier(node) && node.getStart(f.source) >= s.pos && node.getEnd() <= s.endPos) {
        const parent = node.parent;
        const isDeclName =
          parent && (parent as { name?: ts.Node }).name === node && (ts.isDeclarationStatement(parent) || ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isClassElement(parent) || ts.isPropertyAssignment(parent));
        if (!isDeclName) {
          let defs: readonly ts.DefinitionInfo[] | undefined;
          try {
            defs = svc.service.getDefinitionAtPosition(absPath, node.getStart(f.source));
          } catch {
            defs = undefined;
          }
          for (const d of defs ?? []) {
            const rp = this.index.repoPath(d.fileName);
            if (!rp) continue;
            const target = this.index.enclosing(rp, d.textSpan.start);
            if (!target || target.id === s.id || target.parent === s.id) continue;
            // a member of a class we already list is covered by the class line unless it is itself the target
            found.set(target.id, target);
            break;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(f.source);
    return [...found.values()];
  }

  /** References to a symbol, mapped to their enclosing symbols. */
  private refs(s: Sym, limit: number): { lines: string[]; total: number; project: string } | null {
    const svc = this.index.service(s.path);
    if (!svc) return null;
    let found: ts.ReferencedSymbol[] | undefined;
    try {
      found = svc.service.findReferences(join(this.index.root, s.path), s.namePos);
    } catch {
      found = undefined;
    }
    const lines: string[] = [];
    const seen = new Set<string>();
    let total = 0;
    for (const group of found ?? []) {
      for (const r of group.references) {
        const rp = this.index.repoPath(r.fileName);
        if (!rp) continue;
        if (rp === s.path && r.textSpan.start >= s.pos && r.textSpan.start < s.endPos) continue; // own declaration/body
        const f = this.index.file(rp);
        if (!f) continue;
        // import/export lines are plumbing, not uses
        const stmt = f.source.statements.find((st) => st.pos <= r.textSpan.start && r.textSpan.start < st.end);
        if (stmt && (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt) || ts.isImportEqualsDeclaration(stmt))) continue;
        const line = this.index.lineOf(f, r.textSpan.start);
        const key = `${rp}:${line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        total++;
        if (lines.length >= limit) continue;
        const enc = this.index.enclosing(rp, r.textSpan.start);
        lines.push(`  ${enc ? enc.qualifiedName : "(top level)"} — ${rp}:${line} — ${this.index.lineText(f, line).trim().slice(0, 120)}`);
      }
    }
    return { lines, total, project: svc.project };
  }

  /** Body, or a pointer when this body was already shown (in this response or earlier in the session). */
  private bodyOrPointer(s: Sym, view: View, maxLines: number): string {
    const key = `${s.id}@${s.hash}`;
    if (view.shownInResponse.has(key)) return `(shown above, #${s.hash})`;
    if (this.shown.has(key)) return `(unchanged since shown earlier, #${s.hash})`;
    view.shownInResponse.add(key);
    return this.body(s, maxLines);
  }

  private commit(view: View) {
    for (const k of view.shownInResponse) this.shown.add(k);
  }

  // ---- tools (contract section 2) ----

  get(args: { symbols: string[]; deps?: "signatures" | "none"; callers?: boolean; maxLines?: number }): string {
    this.index.refresh();
    const view = new View();
    const maxLines = args.maxLines ?? 120;
    for (const raw of args.symbols) {
      const r = this.resolve(raw);
      if (r.kind === "missing") {
        view.add(this.missingText(raw, r.suggestions), raw);
        continue;
      }
      if (r.kind === "ambiguous") {
        view.add(this.ambiguousText(raw, r.matches), raw);
        continue;
      }
      const s = r.sym;
      const parts = [this.header(s), this.bodyOrPointer(s, view, maxLines)];
      if ((args.deps ?? "signatures") === "signatures" && CAPABILITIES.deps) {
        const deps = this.deps(s);
        if (deps.length) {
          // Callables keep a short signature (the API you'll call); everything else is name + location.
          const line = (d: Sym) =>
            d.kind === "function" || d.kind === "method" || d.kind === "handler"
              ? `  ${d.signature.length > 100 ? d.signature.slice(0, 99) + "…" : d.signature} — ${this.short(d.path)}:${d.start}`
              : `  ${d.qualifiedName} (${d.kind}) — ${this.short(d.path)}:${d.start}`;
          parts.push("uses:\n" + deps.map(line).join("\n"));
        }
      }
      if (args.callers ?? true) {
        const refs = this.refs(s, 5);
        if (refs && refs.total) {
          parts.push(`used by (${refs.total}${refs.total > refs.lines.length ? `, first ${refs.lines.length}; code_refs for all` : ""}):\n${refs.lines.join("\n")}`);
        } else if (refs) {
          parts.push(`used by: none found in ${refs.project}`);
        }
      }
      view.add(parts.join("\n") + "\n", raw);
    }
    this.commit(view);
    return view.toString();
  }

  refsTool(args: { symbols: string[]; limit?: number }): string {
    this.index.refresh();
    const view = new View();
    for (const raw of args.symbols) {
      const r = this.resolve(raw);
      if (r.kind === "missing") {
        view.add(this.missingText(raw, r.suggestions), raw);
        continue;
      }
      if (r.kind === "ambiguous") {
        view.add(this.ambiguousText(raw, r.matches), raw);
        continue;
      }
      const res = this.refs(r.sym, args.limit ?? 30);
      const head = `### references to ${r.sym.qualifiedName} (${r.sym.path}:${r.sym.start})`;
      if (!res) view.add(`${head}\n  (no TypeScript project covers this file)\n`, raw);
      else
        view.add(
          `${head} — ${res.total} in ${res.project}${res.total > res.lines.length ? `, first ${res.lines.length}` : ""}\n${res.lines.join("\n") || "  none"}\n`,
          raw,
        );
    }
    return view.toString();
  }

  find(args: { patterns: string[]; paths?: string[]; limit?: number }): string {
    this.index.refresh();
    const view = new View();
    const limit = args.limit ?? 12;
    const prefixes = (args.paths ?? []).map((p) => p.replace(/^\.?\//, "").replace(/\/$/, ""));
    const files = this.index
      .allFiles()
      .filter((f) => !prefixes.length || prefixes.some((p) => f.path === p || f.path.startsWith(p + "/")))
      .sort((a, b) => Number(/\.(test|spec)\./.test(a.path)) - Number(/\.(test|spec)\./.test(b.path)) || a.path.localeCompare(b.path));
    for (const pattern of args.patterns) {
      let re: RegExp;
      const m = pattern.match(/^\/(.+)\/([a-z]*)$/);
      try {
        re = m ? new RegExp(m[1], m[2].replace("g", "")) : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      } catch (e) {
        view.add(`invalid pattern ${pattern}: ${(e as Error).message}`, pattern);
        continue;
      }
      const groups = new Map<string, { sym: Sym | null; path: string; lines: number[] }>();
      let totalLines = 0;
      for (const f of files) {
        if (!re.test(f.text)) continue;
        for (let n = 1; n <= f.lineStarts.length; n++) {
          const text = this.index.lineText(f, n);
          if (!re.test(text)) continue;
          totalLines++;
          const sym = this.index.enclosing(f.path, this.index.offsetOfLine(f, n) + (text.length - text.trimStart().length));
          const key = sym ? sym.id : `${f.path}#top`;
          const g = groups.get(key) ?? { sym, path: f.path, lines: [] };
          g.lines.push(n);
          groups.set(key, g);
        }
      }
      const list = [...groups.values()];
      const out = [`### "${pattern}" — ${totalLines} lines in ${list.length} symbols${list.length > limit ? `, first ${limit} (narrow with paths, or raise limit)` : ""}`];
      for (const g of list.slice(0, limit)) {
        const f = this.index.file(g.path)!;
        const where = g.sym
          ? `${g.sym.qualifiedName} · ${g.sym.kind} · ${g.path}:${g.sym.start}-${g.sym.end}${g.sym.isTest ? " · test" : ""}`
          : `${g.path} (top level)`;
        const shown = g.lines.slice(0, 3).map((n) => `    ${n}│${this.index.lineText(f, n).trim().slice(0, 120)}`);
        if (g.lines.length > 3) shown.push(`    … ${g.lines.length - 3} more matching lines`);
        out.push(`  ${where}\n${shown.join("\n")}`);
      }
      view.add(out.join("\n") + "\n", pattern);
    }
    return view.toString();
  }

  outline(args: { paths: string[]; depth?: number }): string {
    this.index.refresh();
    const view = new View();
    const depth = args.depth ?? 1;
    for (const raw of args.paths) {
      const p = raw.replace(/^\.?\//, "").replace(/\/$/, "");
      const file = this.index.file(p) ?? (this.fileBySuffix(p).length === 1 ? this.fileBySuffix(p)[0] : null);
      if (file) {
        const lines = [`### outline ${file.path} (${file.lineStarts.length} lines)`];
        for (const s of file.symbols) {
          const indent = s.parent ? "    " : "  ";
          const kindTag = new RegExp(`^(export\\s+)?(default\\s+)?(async\\s+)?(declare\\s+)?${s.kind}\\b`).test(s.signature) ? "" : `${s.kind} `;
          lines.push(`${indent}${s.start}-${s.end} ${kindTag}${s.signature}${s.isTest ? " · test" : ""}`);
        }
        if (file.symbols.length === 0) lines.push("  (no indexed symbols)");
        view.add(lines.join("\n") + "\n", raw);
        continue;
      }
      const inDir = this.index.allFiles().filter((f) => p === "" || p === "." || f.path.startsWith(p + "/"));
      if (!inDir.length) {
        const dirs = new Set(this.index.allFiles().map((f) => f.path.split("/").slice(0, -1).join("/")));
        view.add(this.missingText(raw, this.nearest(p, [...dirs])), raw);
        continue;
      }
      const base = p === "." ? "" : p;
      const levels = (f: FileEntry) => f.path.slice(base ? base.length + 1 : 0).split("/").length;
      const lines = [`### outline ${p || "."}/ (${inDir.length} source files)`];
      const subdirs = new Map<string, number>();
      for (const f of inDir.sort((a, b) => a.path.localeCompare(b.path))) {
        if (levels(f) > depth) {
          const sub = f.path.slice(base ? base.length + 1 : 0).split("/").slice(0, depth).join("/");
          subdirs.set(sub, (subdirs.get(sub) ?? 0) + 1);
          continue;
        }
        const top = f.symbols.filter((s) => !s.parent);
        const names = top.slice(0, 12).map((s) => s.name);
        lines.push(`  ${f.path.slice(base ? base.length + 1 : 0)} (${f.lineStarts.length} lines): ${names.join(", ")}${top.length > 12 ? `, … ${top.length - 12} more` : ""}`);
      }
      for (const [sub, n] of subdirs) lines.push(`  ${sub}/ (${n} files)`);
      view.add(lines.join("\n") + "\n", raw);
    }
    return view.toString();
  }
}
