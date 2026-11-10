# Environment: Actual Budget monorepo

| Field | Value |
|---|---|
| Repository | Actual Budget (local-first personal finance app), TypeScript, Yarn 4 workspaces |
| Runtime | Node 22 |
| Dependencies | already installed; do not add new ones |
| Package manager | `node .yarn/releases/yarn-4.17.1.cjs` (or `yarn` if available), always from the repo root |
| Tests | `yarn workspace @actual-app/core run test:node <path>` for loot-core; `yarn workspace @actual-app/api run test` for the API |
| Typecheck | `yarn workspace @actual-app/core run typecheck` (about 15 s) |
| Network | not needed; no servers are involved |

The task is checked through the public Node API package `@actual-app/api` (`packages/api`), built from your workspace, plus the repository's existing tests.

**Network:** work only from the code in this workspace. There is no network access apart from the model API; do not fetch the upstream project, other copies of it, or packages.
