# Task: HN3 Named wildcards in route paths
Type: feature
Start state: Hono at the suite's pinned commit

## Goal
Let a route capture the rest of the path under a name: `app.get('/files/*path', …)` matches `/files/a/b/c` and gives `c.req.param('path') === 'a/b/c'`.

## Interface
A route path may end with `*<name>`, where `<name>` is a JavaScript identifier (letters, digits, `_`, `$`; not starting with a digit), as its last segment.

## Rules
R1. `/files/*path` matches every path under `/files/` with at least one more character, and `c.req.param('path')` is the rest of the path after `/files/` (it may contain `/`).
R2. It does not match `/files` or `/files/`.
R3. The captured value is decoded like any other path parameter (`/files/a%20b` gives `a b`).
R4. It can be combined with other parameters (`/users/:id/files/*path` gives both), and `c.req.param()` (all parameters) includes it.
R5. It works the same with every built-in router: the default router, `RegExpRouter`, `TrieRouter`, `PatternRouter` and `LinearRouter`.

## Constraints
- A plain `*` (unnamed wildcard) keeps working exactly as before.
- All existing tests must still pass.

## Out of scope
Named wildcards in the middle of a path. Types for `c.req.param()` inference.

## Visible examples
```
app.get('/files/*path', (c) => c.text(c.req.param('path')))
GET /files/a        → 200 "a"
GET /files/a/b/c    → 200 "a/b/c"
GET /files          → 404
```
