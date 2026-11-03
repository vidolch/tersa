# tersa-query

Batched, symbol-level code queries for coding agents, served as an MCP server. The interface is specified in [`CONTRACT.md`](CONTRACT.md) (v1).

```
npm ci
node src/server.ts --root /path/to/repo      # MCP over stdio
```

Tools: `code_get` (definitions with bodies, dependencies as signatures, callers), `code_find` (search grouped by symbol), `code_refs` (compiler-resolved references), `code_outline` (structure without bodies). All take lists, so one call answers several questions.

How it works: every source file is parsed with the TypeScript compiler for a syntax-level symbol index (about 2 s for Actual's 2,250 files). Each `tsconfig.json` project gets a TypeScript LanguageService, built on first use and warmed in the background at startup, for resolved definitions and references. Files changed on disk are re-indexed before use. Bodies already returned in a session aren't repeated.

Tests:
```
node --test test/engine.test.ts test/server.test.ts            # contract tests on a fixture project, MCP over stdio
ACTUAL_ROOT=/path/to/actual node --test test/actual.test.ts     # each Actual task's core files reachable in 1–2 queries
```

Used by benchmark arm B (`arms/B-ts-query/agent.json`); the agent also gets `arms/B-ts-query/query-layer.md` as a usage note.
