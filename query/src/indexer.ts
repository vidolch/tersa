// TypeScript/JavaScript indexer (contract section 6).
// Syntax-level symbol index over every source file (fast, no type checking),
// plus one TypeScript LanguageService per tsconfig project, created on first
// use, for resolved definitions and references.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import ts from "typescript";

export type Kind = "function" | "method" | "class" | "interface" | "type" | "enum" | "variable" | "property" | "handler";

export interface Sym {
  id: string;
  name: string;
  qualifiedName: string;
  kind: Kind;
  path: string;
  start: number;
  end: number;
  /** Character offsets of the symbol's text (leading comments included). */
  pos: number;
  endPos: number;
  /** Offset of the declaration's name, for LanguageService lookups. */
  namePos: number;
  signature: string;
  hash: string;
  isTest: boolean;
  parent?: string;
}

export const CAPABILITIES = {
  resolvedRefs: true,
  deps: true,
  contracts: "docs",
  effects: "none",
} as const;

const SOURCE_EXT = /\.(tsx?|mts|cts|jsx?|mjs|cjs)$/;
const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "build", "lib-dist", "@types", "coverage"]);
const TEST_FILE = /\.(test|spec)\.[^.]+$|(^|\/)__tests__\//;

export interface FileEntry {
  path: string; // repo-relative, "/" separators
  mtimeMs: number;
  text: string;
  source: ts.SourceFile;
  lineStarts: readonly number[];
  symbols: Sym[]; // sorted by pos
}

function toPosix(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

function hash6(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 6);
}

function scriptKind(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(js|mjs|cjs)$/.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function oneLine(s: string, max = 200): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/** Text of a declaration up to its body, as one line. */
function signatureOf(node: ts.Node, sf: ts.SourceFile): string {
  const start = node.getStart(sf);
  let end = node.getEnd();
  const body =
    (ts.isFunctionLike(node) && (node as ts.FunctionLikeDeclaration).body) ||
    (ts.isClassLike(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)
      ? (node.members as ts.NodeArray<ts.Node>).pos
      : undefined);
  if (typeof body === "number") end = body;
  else if (body) end = body.getStart(sf);
  if (ts.isVariableDeclaration(node) && node.initializer) {
    const init = node.initializer;
    if ((ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && init.body) end = init.body.getStart(sf);
    else end = Math.min(end, init.getStart(sf) + 80);
  }
  return oneLine(sf.text.slice(start, end).replace(/[{=]\s*$/, ""));
}

/** Start offset including directly preceding comments (doc comments are part of a symbol). */
function startWithComments(node: ts.Node, sf: ts.SourceFile): number {
  const ranges = ts.getLeadingCommentRanges(sf.text, node.getFullStart()) ?? [];
  return ranges.length ? ranges[0].pos : node.getStart(sf);
}

export function extractSymbols(sf: ts.SourceFile, path: string): Sym[] {
  const out: Sym[] = [];
  const isTest = TEST_FILE.test(path);
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const add = (node: ts.Node, name: string, qualifiedName: string, kind: Kind, nameNode: ts.Node, parent?: Sym, signature?: string) => {
    const pos = startWithComments(node, sf);
    const endPos = node.getEnd();
    const text = sf.text.slice(pos, endPos);
    const start = lineOf(pos);
    const sym: Sym = {
      id: `${path}#${qualifiedName}#${start}`,
      name,
      qualifiedName,
      kind,
      path,
      start,
      end: lineOf(endPos),
      pos,
      endPos,
      namePos: nameNode.getStart(sf),
      signature: signature ?? signatureOf(node, sf),
      hash: hash6(text),
      isTest,
      ...(parent ? { parent: parent.id } : {}),
    };
    out.push(sym);
    return sym;
  };

  const nameText = (n: ts.PropertyName | ts.BindingName | undefined): string | null => {
    if (!n) return null;
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
    if (ts.isComputedPropertyName(n) && ts.isStringLiteralLike(n.expression)) return n.expression.text;
    return null;
  };

  const members = (container: ts.Node, owner: Sym, ownerName: string) => {
    const list = ts.isClassLike(container)
      ? container.members
      : ts.isObjectLiteralExpression(container)
        ? container.properties
        : ts.isInterfaceDeclaration(container)
          ? container.members
          : undefined;
    if (!list) return;
    for (const m of list) {
      const n = nameText((m as { name?: ts.PropertyName }).name);
      if (ts.isConstructorDeclaration(m)) {
        add(m, "constructor", `${ownerName}.constructor`, "method", m.getFirstToken(sf) ?? m, owner);
        continue;
      }
      if (!n || !(m as { name?: ts.Node }).name) continue;
      const nameNode = (m as { name: ts.Node }).name;
      const isFn =
        ts.isMethodDeclaration(m) ||
        ts.isMethodSignature(m) ||
        ts.isGetAccessor(m) ||
        ts.isSetAccessor(m) ||
        (ts.isPropertyAssignment(m) && (ts.isArrowFunction(m.initializer) || ts.isFunctionExpression(m.initializer))) ||
        (ts.isPropertyDeclaration(m) && !!m.initializer && (ts.isArrowFunction(m.initializer) || ts.isFunctionExpression(m.initializer)));
      if (ts.isInterfaceDeclaration(container)) continue; // interface members are part of its body
      add(m, n, `${ownerName}.${n}`, isFn ? "method" : "property", nameNode, owner);
    }
  };

  const visitTop = (stmt: ts.Statement) => {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      add(stmt, stmt.name.text, stmt.name.text, "function", stmt.name);
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      const c = add(stmt, stmt.name.text, stmt.name.text, "class", stmt.name);
      members(stmt, c, stmt.name.text);
    } else if (ts.isInterfaceDeclaration(stmt)) {
      add(stmt, stmt.name.text, stmt.name.text, "interface", stmt.name);
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      add(stmt, stmt.name.text, stmt.name.text, "type", stmt.name);
    } else if (ts.isEnumDeclaration(stmt)) {
      add(stmt, stmt.name.text, stmt.name.text, "enum", stmt.name);
    } else if (ts.isVariableStatement(stmt)) {
      const single = stmt.declarationList.declarations.length === 1;
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const init = d.initializer;
        const isFn = !!init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
        // A single declaration owns the whole statement (keeps `export const` and comments).
        const node = single ? stmt : d;
        const v = add(node, d.name.text, d.name.text, isFn ? "function" : "variable", d.name, undefined, signatureOf(d, sf));
        let obj = init;
        while (obj && (ts.isAsExpression(obj) || ts.isSatisfiesExpression(obj) || ts.isParenthesizedExpression(obj))) obj = obj.expression;
        if (obj && ts.isObjectLiteralExpression(obj)) members(obj, v, d.name.text);
      }
    } else if (ts.isExpressionStatement(stmt)) {
      const e = stmt.expression;
      // handlers['api/schedule-create'] = …
      if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isElementAccessExpression(e.left)) {
        const arg = e.left.argumentExpression;
        if (ts.isStringLiteralLike(arg)) add(stmt, arg.text, arg.text, "handler", arg);
      }
      // app.method('rule-add', mutator(addRule))
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.arguments.length >= 2) {
        const first = e.arguments[0];
        if (ts.isStringLiteralLike(first) && /^[\w/.:-]+$/.test(first.text)) {
          add(stmt, first.text, first.text, "handler", first, undefined, oneLine(stmt.getText(sf)));
        }
      }
    } else if (ts.isModuleDeclaration(stmt) && stmt.body && ts.isModuleBlock(stmt.body)) {
      stmt.body.statements.forEach(visitTop);
    }
  };

  sf.statements.forEach(visitTop);
  out.sort((a, b) => a.pos - b.pos || b.endPos - a.endPos);
  return out;
}

interface Project {
  dir: string;
  fileNames: Set<string>; // absolute
  service: ts.LanguageService | null;
  options: ts.CompilerOptions;
}

export class Index {
  readonly root: string;
  private files = new Map<string, FileEntry>();
  private byName = new Map<string, Sym[]>();
  private lastScan = 0;
  private projects: Project[] | null = null;
  private versions = new Map<string, number>(); // absolute path → version for LanguageServices

  constructor(root: string) {
    this.root = root;
    this.refresh(true);
  }

  // ---- files and syntax index ----

  private walk(dir: string, out: string[]) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (!EXCLUDED_DIRS.has(e.name)) this.walk(abs, out);
      } else if (e.isFile() && SOURCE_EXT.test(e.name) && !e.name.endsWith(".d.ts.map")) {
        out.push(abs);
      }
    }
  }

  /** Rescans the tree (throttled) and re-indexes files whose mtime changed. */
  refresh(force = false) {
    const now = Date.now();
    if (!force && now - this.lastScan < 1500) return;
    this.lastScan = now;
    const seen = new Set<string>();
    const all: string[] = [];
    this.walk(this.root, all);
    for (const abs of all) {
      const path = toPosix(relative(this.root, abs));
      seen.add(path);
      this.ensureFile(path, abs);
    }
    for (const path of [...this.files.keys()]) if (!seen.has(path)) this.dropFile(path);
  }

  private ensureFile(path: string, abs = join(this.root, path)): FileEntry | null {
    if (!SOURCE_EXT.test(path)) return null;
    let mtimeMs: number;
    try {
      const st = statSync(abs);
      if (!st.isFile()) return null;
      mtimeMs = st.mtimeMs;
    } catch {
      this.dropFile(path);
      return null;
    }
    const prev = this.files.get(path);
    if (prev && prev.mtimeMs === mtimeMs) return prev;
    const text = readFileSync(abs, "utf8");
    const source = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, scriptKind(path));
    let symbols: Sym[] = [];
    try {
      symbols = extractSymbols(source, path);
    } catch {
      symbols = [];
    }
    if (prev) this.unindex(prev);
    const entry: FileEntry = { path, mtimeMs, text, source, lineStarts: source.getLineStarts(), symbols };
    this.files.set(path, entry);
    for (const s of symbols) {
      const list = this.byName.get(s.name) ?? [];
      list.push(s);
      this.byName.set(s.name, list);
    }
    this.versions.set(abs, (this.versions.get(abs) ?? 0) + 1);
    return entry;
  }

  private unindex(entry: FileEntry) {
    for (const s of entry.symbols) {
      const list = this.byName.get(s.name);
      if (!list) continue;
      const next = list.filter((x) => x.path !== entry.path);
      if (next.length) this.byName.set(s.name, next);
      else this.byName.delete(s.name);
    }
  }

  private dropFile(path: string) {
    const prev = this.files.get(path);
    if (!prev) return;
    this.unindex(prev);
    this.files.delete(path);
  }

  file(path: string): FileEntry | null {
    return this.ensureFile(path);
  }
  allFiles(): FileEntry[] {
    return [...this.files.values()];
  }
  names(): IterableIterator<string> {
    return this.byName.keys();
  }
  symbolsNamed(name: string): Sym[] {
    // re-validate files so a stale hit is never returned
    for (const s of this.byName.get(name) ?? []) this.ensureFile(s.path);
    return [...(this.byName.get(name) ?? [])];
  }
  symbolCount(): number {
    let n = 0;
    for (const f of this.files.values()) n += f.symbols.length;
    return n;
  }

  /** Innermost symbol containing a character offset. */
  enclosing(path: string, offset: number): Sym | null {
    const f = this.file(path);
    if (!f) return null;
    let best: Sym | null = null;
    for (const s of f.symbols) {
      if (s.pos <= offset && offset < s.endPos) {
        if (!best || s.endPos - s.pos <= best.endPos - best.pos) best = s;
      }
    }
    return best;
  }

  lineText(entry: FileEntry, line: number): string {
    const start = entry.lineStarts[line - 1] ?? entry.text.length;
    const end = entry.lineStarts[line] ?? entry.text.length;
    return entry.text.slice(start, end).replace(/\r?\n$/, "");
  }

  lineOf(entry: FileEntry, offset: number): number {
    return entry.source.getLineAndCharacterOfPosition(offset).line + 1;
  }

  offsetOfLine(entry: FileEntry, line: number): number {
    return entry.lineStarts[Math.max(0, line - 1)] ?? 0;
  }

  // ---- language services ----

  private loadProjects(): Project[] {
    if (this.projects) return this.projects;
    const configs: string[] = [];
    const find = (dir: string, depth: number) => {
      if (depth > 3) return;
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.startsWith(".") || EXCLUDED_DIRS.has(e.name)) continue;
        if (e.isFile() && e.name === "tsconfig.json") configs.push(join(dir, e.name));
        else if (e.isDirectory()) find(join(dir, e.name), depth + 1);
      }
    };
    find(this.root, 0);
    this.projects = [];
    for (const cfg of configs) {
      const read = ts.readConfigFile(cfg, ts.sys.readFile);
      if (read.error) continue;
      const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(cfg));
      if (!parsed.fileNames.length) continue;
      this.projects.push({
        dir: dirname(cfg),
        fileNames: new Set(parsed.fileNames.map((f) => toPosix(f))),
        service: null,
        options: { ...parsed.options, noEmit: true, composite: false, declaration: false, declarationMap: false, emitDeclarationOnly: false, incremental: false },
      });
    }
    // Most specific first.
    this.projects.sort((a, b) => b.dir.length - a.dir.length);
    return this.projects;
  }

  private projectFor(path: string): Project | null {
    const abs = toPosix(join(this.root, path));
    const projects = this.loadProjects();
    return projects.find((p) => p.fileNames.has(abs)) ?? projects.find((p) => abs.startsWith(toPosix(p.dir) + "/")) ?? null;
  }

  service(path: string): { service: ts.LanguageService; project: string } | null {
    const p = this.projectFor(path);
    if (!p) return null;
    if (!p.service) {
      const index = this;
      const host: ts.LanguageServiceHost = {
        getScriptFileNames: () => [...p.fileNames],
        getScriptVersion: (f) => String(index.versions.get(f) ?? 0),
        getScriptSnapshot: (f) => {
          const rel = toPosix(relative(index.root, f));
          const entry = !rel.startsWith("..") && SOURCE_EXT.test(f) ? index.file(rel) : null;
          if (entry) return ts.ScriptSnapshot.fromString(entry.text);
          if (!existsSync(f)) return undefined;
          return ts.ScriptSnapshot.fromString(readFileSync(f, "utf8"));
        },
        getCurrentDirectory: () => p.dir,
        getCompilationSettings: () => p.options,
        getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
        fileExists: ts.sys.fileExists,
        readFile: ts.sys.readFile,
        readDirectory: ts.sys.readDirectory,
        directoryExists: ts.sys.directoryExists,
        getDirectories: ts.sys.getDirectories,
      };
      p.service = ts.createLanguageService(host, ts.createDocumentRegistry());
    }
    return { service: p.service, project: toPosix(relative(this.root, p.dir)) || "." };
  }

  /**
   * Builds the TypeScript programs ahead of the first query (a cold build
   * reads thousands of type files), within a time budget.
   */
  warm(budgetMs = 20_000): string[] {
    const done: string[] = [];
    // Smallest first: libraries and backends are ready quickly; a huge UI
    // project that would blow the budget is left to build on first use.
    const projects = [...this.loadProjects()].sort((a, b) => a.fileNames.size - b.fileNames.size);
    const start = Date.now();
    for (const p of projects) {
      if (Date.now() - start > budgetMs) break;
      const any = [...p.fileNames][0];
      const rel = toPosix(relative(this.root, any));
      const svc = this.service(rel);
      try {
        svc?.service.getProgram();
        if (svc) done.push(svc.project);
      } catch {
        /* a broken project must not stop the server */
      }
    }
    return done;
  }

  /** Repo-relative path for an absolute file name, or null if outside the root or excluded. */
  repoPath(fileName: string): string | null {
    const rel = toPosix(relative(this.root, fileName));
    if (rel.startsWith("..")) return null;
    if (rel.split("/").some((seg) => EXCLUDED_DIRS.has(seg) || seg.startsWith("."))) return null;
    return rel;
  }
}
