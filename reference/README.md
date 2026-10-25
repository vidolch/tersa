# Reference solutions

Never shown to agents. Used as start states for later tasks and to validate the acceptance suite.

| Snapshot | Used as start state for | Status |
|---|---|---|
| `T1` | T2 | TODO (strip T2–T5 features from `T5`) |
| `T2` | — | TODO |
| `T3-start` | T3 | TODO (`T2` + click counted before method/expiry check) |
| `T3` | T4 | TODO |
| `T4` | T5 | TODO |
| `T5` | — | done |

Validate any snapshot with `acceptance/run.sh <task> reference/<snapshot> A-ts-baseline`.
`T3-start` must fail T3 R2–R4 and pass everything else.
