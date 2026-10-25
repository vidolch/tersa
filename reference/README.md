# Reference solutions

Never shown to agents. Used as start states for later tasks and to validate the acceptance suite.

| Snapshot | Start state for | Satisfies | Notes |
|---|---|---|---|
| `T1` | T2 | T1 | single file, SQLite inline |
| `T2` | — | T1–T2 | same code as `T3` |
| `T3-start` | T3 | T1–T2 | `T2` with click counted before method/expiry check; fails exactly T3 R2–R4 |
| `T3` | T4 | T1–T3 | persistence mixed into `src/main.ts`, so it fails T4 R5 by design |
| `T4` | T5 | T1–T4 | `src/storage/` boundary, `file` and `memory` stores |
| `T5` | — | T1–T5 | |

All snapshots run on Node 22.18+ with no dependencies (`node:http`, `node:sqlite`).

Validate a snapshot: `acceptance/run.sh <task> reference/<snapshot> A-ts-baseline`.
