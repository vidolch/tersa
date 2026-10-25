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
