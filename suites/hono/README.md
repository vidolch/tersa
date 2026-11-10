# Suite: hono

[Hono](https://github.com/honojs/hono) v4.13.17 (commit 61f7c59), MIT. A web framework with five router implementations that must agree. Added in iteration 21 as a second codebase, so findings from `actual` can be checked elsewhere.

| Task | Type | Area | What |
|---|---|---|---|
| HN1 | seeded bug | routing | TrieRouter returns matching handlers in reverse registration order. The upstream tests stating the order (156) are hidden from the agent and restored for scoring. |
| HN2 | seeded bug | headers | `parseAccept` sorts by ascending quality; the language detector then picks the least preferred language. 5 upstream tests hidden and restored. |
| HN3 | feature | routing | Named trailing wildcard `/files/*path`, the same with all five routers. |
| HN4 | feature | middleware | `cors({ allowPrivateNetwork })` answers Private Network Access preflights. |

- `scripts/prepare.sh`: workspace from the pristine clone (source only, no history), start patch, arm patch, `pnpm install` (pnpm version from `packageManager`).
- `scripts/evaluate.sh`: restores the pinned commit's tests for the task's scope (`task.json` `regression.dirs`), runs them, then the hidden acceptance tests in `acceptance/` against the workspace's source (`HONO_ROOT`).
- `scripts/strip-blocks.py`: removes test blocks by line; used only to build start patches.
- Validate: `SUITE=hono harness/validate-suite.sh [TASK...]`.
