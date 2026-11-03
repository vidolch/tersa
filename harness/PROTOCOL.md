# Run protocol

## Fixed per experiment
- Model, harness name and version, sampling settings, turn and token caps.
- Machine and Node version for acceptance and perf.
- Specs: frozen; `specSha256` recorded per run.

## Per run
1. Create an empty workspace from the arm's scaffold (T1) or the task's reference start state.
2. Give the agent only: `specs/<task>.md`, `arms/<arm>/profile.md`, and the arm's tools/skill.
   Prompt: "Implement the task in specs/<task>.md. The service must satisfy every rule." Nothing else.
3. Let the agent run until it stops or hits the cap. Log every API call's usage.
4. Run `acceptance/run.sh <task> <workspace> <arm>` and, if acceptance passed, `perf/load.js`.
5. Write the run record (`harness/run-record.schema.json`).

## Volume
- ≥5 runs per task per arm, independent (fresh workspace, fresh session).
- Plus one chained run per arm: T1→T5 in one workspace, T5 still in a fresh session.

## Reporting
- Primary: cost per passing task = Σ costUsd ÷ count(acceptance.passed && perf.passed), per task and arm.
- Secondary: tokens by class, toolCalls, repeatReads, compileFailures, per-rule pass rates, latency.
- Report medians and spread, not single runs.

## Validity
- The agent never sees `acceptance/`, `perf/` or `reference/`.
- If a spec has to change, it gets a new task ID and earlier results stay as they are.

## Invalidated results
- 2026-11-03, `A-ts-baseline` T4 runs 2–6 (deepseek-v4-flash): deleted and rerun. The harness passed `STORAGE=""` instead of leaving it unset, and the evaluator dropped skipped tests, so the runs were marked failed without a failing rule. Fixed in the acceptance runner and `evaluate.ts`; covered by `harness/fixtures/`.
- 2026-11-03, `A-ts-baseline` AB1–AB4 runs 1–6 (deepseek-v4-flash): archived to `results/archive/2026-11-03-actual-pre-isolation/`. AB1 runs 1 and 5 downloaded the upstream source with `curl` and diffed it against the seeded workspace. All runs predate the provider-only network policy and the profile's network line, and their reading metric counted only the Read tool. Rerun under the new setup.

## Network policy
The agent phase runs as a separate user whose only egress is a local proxy that tunnels to the model provider's API (`harness/sandbox/egress-proxy.mjs`); a CI step proves github.com is unreachable before the agent starts. Identical for every arm. Records carry `network.policy`; runs that used the network without `provider-only` are reported as invalid and not scored.
