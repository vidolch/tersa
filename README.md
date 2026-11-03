# tersa-bench

Benchmark for measuring **cost per passing task** of coding agents across three arms:

| Arm | Language | Agent tooling |
|---|---|---|
| **A** `A-ts-baseline` | TypeScript | Standard agent tools (read, grep, edit, bash) |
| **B** `B-ts-query` | TypeScript | Standard tools + Tersa query layer |
| **C** `C-tersa-lang` | Tersa (transpiles to TS) | Standard tools + Tersa query layer |

- **B vs A** isolates the query/read-optimization layer.
- **C vs B** isolates the language.
- All arms run on the same runtime (Node 22), so performance numbers are directly comparable.

## Problems tracked

| ID | Problem | Measured by |
|---|---|---|
| P1 | Reading cost: re-reads, whole files, round trips | input tokens, tool calls |
| P2 | Wrong code → retries | compile/test failures per task |
| P3 | Hallucinated or unknown APIs | compile errors on unknown symbols |
| P4 | Fragile edits | failed edit tool calls |
| P6 | Noisy tool output | tokens in tool results |
| P8 | Context decay in long sessions | chained-run pass rate, re-reads |

P0 (intent) is out of scope. Specs are written to be unambiguous so it doesn't add noise.

## Layout

```
suites/actual/  Actual Budget suite: real large codebase (see its README)
specs/        shared, tech-neutral task specs for the urlshort suite (frozen before first run)
acceptance/   shared hidden black-box tests (HTTP), one suite for all arms
perf/         shared load profile (k6)
arms/         per-arm profile + starter scaffold (tech-specific)
harness/      run-record contract and run protocol
reference/    reference solutions = start states for later tasks (never shown to agents)
```

**Isolation rule:** an agent workspace is built only from `arms/<arm>/scaffold/` (or a reference snapshot) plus `specs/<task>.md`. `acceptance/`, `perf/` and `reference/` are never visible to the agent.

## Primary metric

**Cost per passing task** = total USD across runs ÷ runs passing all acceptance rules and perf thresholds.

Secondary: tokens by class (uncached input, cache read, cache write, output), tool calls, wall time, compile/test failures, per-rule pass rate, p50/p95/p99 latency.

## Protocol (summary)

- Same model, harness version and settings across arms.
- ≥5 runs per task per arm.
- Each task starts from a fixed reference state, so one failure doesn't poison the next. One fully chained run per arm is recorded separately (P8).
- Specs are byte-identical across arms.

See `harness/PROTOCOL.md`.

## Status

- [x] Spec template and conventions
- [x] URL shortener tasks T1–T5 (small control codebase)
- [x] Acceptance suite skeleton
- [x] Run-record contract
- [x] Reference solution for T5 (passes all 70 acceptance tests, both storage modes)
- [x] Reference snapshots T1, T2, T3-start, T3, T4 (each validated at its task level)
- [x] Large real codebase: `suites/actual` (Actual Budget, 4 tasks, reading-precision metric)
- [x] Harness runner (Claude Agent SDK, usage + metrics, acceptance, perf, report)
- [x] GitHub Actions: `ci` self-check on every push, `bench` manual benchmark runs
