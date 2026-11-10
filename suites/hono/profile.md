# Environment: Hono

| Field | Value |
|---|---|
| Repository | Hono (web framework for JavaScript runtimes), TypeScript, single package, source in `src/` |
| Runtime | Node 22 |
| Dependencies | already installed; do not add new ones |
| Tests | `npx vitest run --coverage.enabled=false <path>` from the repo root (e.g. `src/router`) |
| Typecheck | `npx tsc --noEmit -p tsconfig.spec.json` (about 15 s) |
| Network | not needed; no servers are involved |

The task is checked through Hono apps built from your workspace's source (`new Hono()` and `app.request()`), plus the repository's existing tests.

**Network:** work only from the code in this workspace. There is no network access apart from the model API; do not fetch the upstream project, other copies of it, or packages.
