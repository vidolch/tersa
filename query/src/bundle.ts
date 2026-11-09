// Task-scoped context bundle: code likely relevant to a task, selected
// automatically from the task text (never from ground truth), rendered within
// a token budget so it can be put in the agent's first prompt.
//
// Selection, generic by design (v2):
//  1. Terms: code-looking tokens from the task text — `backticked` spans,
//     identifiers in code blocks, camelCase / snake_case / dotted / slash
//     names, and quoted strings — each expanded to its other naming
//     conventions (lastMonthOverspent ↔ last-month-overspent ↔ last_month_overspent).
//  2. Prose words (≥ 5 letters, stemmed) are matched against symbol names only,
//     so a symptom like "ranked in the wrong order" can reach rankRules.
//  3. Score per symbol, every term weighted by rarity (IDF over files):
//     defining a code term 3×idf, mentioning it 1×idf, a prose stem in its
//     name 1×idf; ×0.3 for tests and documentation code; ties to the smaller symbol.
//  4. Render: bodies of the top symbols while they fit half the budget, then
//     signature lines for the rest until the budget is used.
import { Engine } from "./engine.ts";
import type { Sym } from "./indexer.ts";

export interface BundleOptions {
  /** Token budget for the whole bundle (chars ÷ 4). */
  budgetTokens?: number;
  /** Most bodies to include. */
  maxBodies?: number;
  /** Longest body to include whole, in lines. */
  maxBodyLines?: number;
}

export interface Bundle {
  text: string;
  terms: string[];
  /** Files of the included symbols, best first. */
  files: string[];
  tokens: number;
}

const STOP = new Set(
  "the and for with that this from into when then than not are was were has have had but all any can each only same also must should other more most some such their there these those they them will would could does done use used uses using via per new old get set run add one two three true false null undefined none json http https api type string number boolean object array date time code test tests file files task rule rules spec value values field fields name names".split(
    " ",
  ),
);

/** Naming-convention variants of a term (camel, kebab, snake). */
export function variants(term: string): string[] {
  const words = term
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  if (words.length < 2) return [term];
  const camel = words[0] + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  return [...new Set([term, camel, words.join("-"), words.join("_")])];
}

const PROSE_STOP = new Set(
  "about after again against because before being below between could doesn either every expected first following however instead later never other others report reported right same should since something still their there these thing those three through under until users using where which while would wrong already actually happens anything".split(
    " ",
  ),
);

/** Stemmed prose words (≥ 5 letters) for matching against symbol names. */
export function proseStems(text: string): string[] {
  const prose = text.replace(/```[\s\S]*?```|`[^`\n]+`/g, " ");
  const out = new Set<string>();
  for (const m of prose.matchAll(/\b[a-z]{5,}\b/g)) {
    const w = m[0];
    if (PROSE_STOP.has(w) || STOP.has(w)) continue;
    out.add(w.replace(/(ings?|edly|ed|es|s|ly|er|ers|ific|ness)$/, "").slice(0, 8));
  }
  return [...out].filter((s) => s.length >= 4);
}

/** Code-looking terms from free text. */
export function extractTerms(text: string): string[] {
  const out = new Map<string, number>();
  const add = (t: string, w = 1) => {
    const term = t.trim().replace(/^[^\w/.$-]+|[^\w/.$-]+$/g, "");
    if (term.length < 4 || STOP.has(term.toLowerCase()) || /^\d+$/.test(term)) return;
    out.set(term, (out.get(term) ?? 0) + w);
  };
  // `inline code` and fenced blocks: every identifier-like token inside
  for (const m of text.matchAll(/```[\s\S]*?```|`[^`\n]+`/g)) {
    for (const tok of m[0].matchAll(/[A-Za-z_$][\w$]*(?:[./-][A-Za-z_$][\w$]*)*/g)) add(tok[0], 2);
  }
  // camelCase, PascalCase with an inner capital, snake_case, dotted and slash names in prose
  for (const tok of text.matchAll(/\b[a-z]+[A-Z][\w]*\b|\b[A-Z][a-z]+[A-Z][\w]*\b|\b[a-z]+_[a-z_]+\b|\b\w+(?:\.\w+)+\b|\b[a-z]+\/[a-z-]+\b/g)) add(tok[0]);
  // quoted strings
  for (const m of text.matchAll(/"([^"\n]{4,40})"/g)) if (/^[\w./-]+$/.test(m[1])) add(m[1]);
  // dotted names also count by their last part (rules.rankRules → rankRules)
  for (const t of [...out.keys()]) if (t.includes(".")) add(t.split(".").at(-1)!);
  return [...out.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 40);
}

export function buildBundle(engine: Engine, taskText: string, opts: BundleOptions = {}): Bundle {
  const budget = (opts.budgetTokens ?? 6000) * 4; // chars
  const maxBodies = opts.maxBodies ?? 4;
  const maxBodyLines = opts.maxBodyLines ?? 80;
  const ix = engine.index;
  ix.refresh();
  const terms = [...new Set(extractTerms(taskText).flatMap(variants))];
  const stems = proseStems(taskText);
  const files = ix.allFiles();
  const N = files.length;
  const idf = (df: number) => Math.log((N + 1) / (df + 1));

  const score = new Map<string, { sym: Sym; score: number }>();
  const bump = (s: Sym, by: number) => {
    const e = score.get(s.id) ?? { sym: s, score: 0 };
    e.score += by;
    score.set(s.id, e);
  };
  const mentionWeight = new Map<string, number>();
  for (const t of terms) mentionWeight.set(t, idf(files.reduce((n, f) => n + (f.text.includes(t) ? 1 : 0), 0)));
  // definitions
  for (const t of terms) for (const s of ix.symbolsNamed(t.split(".").at(-1)!)) bump(s, 3 * (mentionWeight.get(t) ?? 1));
  // prose stems in symbol names
  if (stems.length) {
    const nameDf = new Map<string, number>();
    const all = files.flatMap((f) => f.symbols);
    for (const st of stems) nameDf.set(st, all.filter((s) => s.name.toLowerCase().includes(st)).length);
    for (const s of all) {
      const name = s.name.toLowerCase();
      for (const st of stems) if ((nameDf.get(st) ?? 0) > 0 && name.includes(st)) bump(s, idf(nameDf.get(st)!) * 0.5);
    }
  }
  // mentions: once per distinct term inside a symbol, weighted by rarity
  for (const t of terms) {
    const w = mentionWeight.get(t) ?? 1;
    const seen = new Set<string>();
    for (const f of files) {
      if (!f.text.includes(t)) continue;
      let from = 0;
      for (;;) {
        const i = f.text.indexOf(t, from);
        if (i < 0) break;
        from = i + t.length;
        const s = ix.enclosing(f.path, i);
        if (s && !seen.has(s.id)) {
          seen.add(s.id);
          bump(s, w);
        }
      }
    }
  }
  const ranked = [...score.values()]
    .map((e) => ({ ...e, score: e.sym.isTest || /(^|\/)docs?\//.test(e.sym.path) ? e.score * 0.3 : e.score }))
    // Prefer the innermost symbol: drop a container when a member of it ranks too.
    .sort((a, b) => b.score - a.score || a.sym.endPos - a.sym.pos - (b.sym.endPos - b.sym.pos));
  // Keep symbols scoring at least 15% of the best one (relative, so it works for any repo size).
  const top = ranked[0]?.score ?? 0;
  const kept = ranked.filter((e) => e.score >= top * 0.15);

  const lines: string[] = [
    "Code that may be relevant, selected automatically from the task text (it can be incomplete or include unrelated code; verify before relying on it):",
    "",
  ];
  let size = lines.join("\n").length;
  const usedFiles: string[] = [];
  const noteFile = (p: string) => {
    if (!usedFiles.includes(p)) usedFiles.push(p);
  };

  let bodies = 0;
  const shown = new Set<string>();
  for (const { sym } of kept) {
    if (bodies >= maxBodies) break;
    const len = sym.end - sym.start + 1;
    if (len > maxBodyLines) continue;
    const f = ix.file(sym.path)!;
    const body = [`### ${sym.qualifiedName} · ${sym.kind} · ${sym.path}:${sym.start}-${sym.end}`];
    for (let n = sym.start; n <= sym.end; n++) body.push(`${n}│${ix.lineText(f, n)}`);
    const text = body.join("\n") + "\n";
    if (size + text.length > budget / 2) continue;
    lines.push(text);
    size += text.length + 1;
    shown.add(sym.id);
    noteFile(sym.path);
    bodies++;
  }

  const sigs: string[] = [];
  for (const { sym } of kept) {
    if (shown.has(sym.id)) continue;
    const line = `- ${sym.path}:${sym.start}-${sym.end} ${sym.qualifiedName} (${sym.kind}): ${sym.signature}`;
    if (size + line.length + 1 > budget) break;
    sigs.push(line);
    size += line.length + 1;
    noteFile(sym.path);
  }
  if (sigs.length) lines.push("Other related symbols (signatures):", ...sigs);
  const text = lines.join("\n");
  return { text, terms, files: usedFiles, tokens: Math.round(text.length / 4) };
}
