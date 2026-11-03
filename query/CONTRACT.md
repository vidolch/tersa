# Tersa query layer — interface contract (v1.1)

The query layer gives a coding agent a **batched, symbol-level view** of a codebase instead of file reads. It targets problems P1 (reading cost), P3 (unknown APIs) and P12 (duplication) from the benchmark. It is language-agnostic by design (indexer → engine → view); v1 ships one indexer, for TypeScript/JavaScript, built on the TypeScript compiler API.

This document is the contract between the agent and the server (the MCP tools) and between the indexer and the engine (the symbol schema). Anything not stated here is an implementation detail.

## 1. Transport

- MCP server over stdio, server name `tersa`.
- Started with the workspace root: `node query/src/server.ts --root <dir>`.
- Read-only: the server never writes to the workspace. Edits stay with the agent's normal edit tools.
- Always reflects the files on disk: a file changed since it was indexed is re-indexed before it is used.

## 2. Tools

All tools take **lists**, so one call can answer several questions (the main lever on turns). Every tool returns one text view (section 3).

### `code_get`
Definitions with their immediate context.
```
{ symbols: string[],              // 1–20 names, see "Symbol names"
  deps?: "signatures" | "none",   // default "signatures": in-repo symbols the body uses
  callers?: boolean,              // default true: where each symbol is used
  maxLines?: number }             // default 120 per body; longer bodies are cut with a notice
```
For each symbol: kind, location, content hash, full body with line numbers; then the in-repo symbols it uses (callables as a signature cut at 100 chars, everything else as name and kind) with locations; then up to 5 callers as enclosing-symbol names with locations (`code_refs` lists all).

### `code_find`
Where something is used or mentioned, grouped by symbol rather than by line.
```
{ patterns: string[],             // 1–10 strings or /regex/flags
  paths?: string[],               // optional path prefixes to restrict the search
  limit?: number }                // default 12 symbols per pattern
```
For each pattern: the enclosing symbols that contain a match, each with location and up to 3 matching lines (line numbers, cut at 120 chars). Matches outside any symbol are grouped under the file.

### `code_refs`
Resolved references (compiler-accurate, not text).
```
{ symbols: string[],              // 1–20 names
  limit?: number }                // default 30 per symbol
```
For each symbol: every reference outside its own declaration, as `enclosing symbol — path:line — source line`.

### `code_outline`
Structure without bodies.
```
{ paths: string[],                // 1–20 files or directories (repo-relative)
  depth?: number }                // directories: how many levels to list, default 1
```
Files: every top-level symbol and class member as one signature line with its line range. Directories: files with their exported symbols' names and line counts.

## 3. Output format

Plain text, designed to be short and quotable:

```
### rankRules · function · packages/loot-core/src/server/rules/rule-utils.ts:87-110 · #3fa2c1
  87│export function rankRules(rules: Iterable<Rule>): Rule[] {
  88│  let pre = [];
     …
uses:
  function _rankRules(rules: Rule[]): Rule[] — rules/rule-utils.ts:63
  Rule (class) — rules/rule.ts:126
used by (2):
  runRules — transactions/transaction-rules.ts:338
  getRulesForPayee — transactions/transaction-rules.ts:402
```

Rules:
- **Locations** are repo-relative `path:start-end`. In `uses`/`used by` lists, paths may be shortened to the last two segments when unambiguous within the response.
- **Line numbers** prefix every body line (`NNN│`), so the agent can cite and edit precisely.
- **Content hash** `#xxxxxx` is the first 6 hex chars of SHA-256 of the symbol's source text. It changes when the symbol changes.
- **Dedupe within a response:** a symbol appears with its body at most once; later mentions refer to it by `#hash`.
- **Dedupe across a session:** if a body with the same hash was already returned earlier in this server session, it is replaced by `(unchanged since shown earlier, #hash)` — the agent already has it in context. Pass the symbol again after it changed and the new body is shown.
- **Not found** never ends the answer: `not found: <name>` plus up to 5 nearest names (`did you mean: …`), so a typo doesn't cost a turn.
- **Ambiguity:** when a name matches several symbols, all matches are listed as locations (no bodies) and the agent picks one with a qualified name.
- **Size cap:** each tool response is cut at ~60,000 characters with a notice saying which items were omitted.

## 4. Symbol names

Accepted forms, tried in order:
1. `path/to/file.ts:Name` — a symbol in a specific file (path may be a suffix, e.g. `rules/rule-utils.ts:rankRules`).
2. `Class.member` — a method, property or getter of a class or object literal.
3. `Name` — any indexed symbol with that name.
4. `path/to/file.ts:123` — the innermost symbol enclosing that line.

Indexed symbols: function declarations, classes and their members, interfaces, type aliases, enums, top-level `const`/`let` declarations (including arrow functions), object-literal methods of exported or top-level objects, and **computed handler registrations** of the form `x['name'] = …` (indexed under `name`, e.g. `api/schedule-create`).

## 5. Scope and exclusions

- Source files: `.ts .tsx .mts .cts .js .jsx .mjs .cjs` under the root.
- Excluded: `node_modules`, `.git`, build output (`dist`, `build`, `lib-dist`, `@types`, `coverage`), and dotted directories.
- Test files (`*.test.*`, `*.spec.*`) are indexed and marked `· test`; they appear in results but rank after non-test symbols.
- `uses` lists only symbols defined inside the root (not dependencies in `node_modules`).

## 6. Indexer → engine schema

What any indexer (TypeScript today, other languages later) must provide per symbol:

```
Symbol {
  id: string            // stable within a session: "<path>#<qualifiedName>#<startLine>"
  name: string          // simple name ("rankRules", "eval", "api/schedule-create")
  qualifiedName: string // "Condition.eval", "rankRules"
  kind: "function" | "method" | "class" | "interface" | "type" | "enum" | "variable" | "property" | "handler"
  path: string          // repo-relative
  start: number; end: number        // 1-based lines, inclusive
  signature: string     // one line, no body
  hash: string          // 6 hex chars of SHA-256(source text)
  isTest: boolean
  parent?: string       // id of the enclosing symbol (members)
}

Capabilities {
  resolvedRefs: boolean        // compiler-accurate references (TS: yes)
  deps: boolean                // can list symbols a body uses (TS: yes)
  contracts: "none" | "docs" | "verified"   // TS v1: "docs" (signature + leading doc comment)
  effects: "none" | "inferred" | "verified" // TS v1: "none"
}
```

The engine degrades by capability: without `resolvedRefs`, `code_refs` falls back to text matches marked `(text match)`; without `deps`, `uses` is omitted.

## 7. Non-goals for v1

- No editing tools (AST-node edits are a later experiment, P4).
- No verified contracts or effects (needs the Tersa language or annotations).
- No cross-session persistence; the index is built at server start (lazily per package) and kept in memory.

## 8. Changes

- **v1.1** (2026-11-03): leaner defaults after the first steered arm-B pilot made runs more expensive. `code_get`: `maxLines` 200 → 120, at most 5 callers, `uses` without hashes and with full signatures only for callables (cut at 100 chars). `code_find`: 12 symbols and 3 lines per symbol by default (was 30 and 5), lines cut at 120 chars. `code_refs`: 30 per symbol (was 50).

## 9. Versioning

The contract has a version (`v1.1`). The server reports it in its MCP `serverInfo.version`. Changing a tool's inputs or output rules means a new version, and benchmark records note which version the arm used.
