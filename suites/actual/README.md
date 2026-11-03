# Suite: Actual Budget

A real, large TypeScript codebase where reading cost matters: [Actual Budget](https://github.com/actualbudget/actual) (MIT), pinned at `suite.json` `commitFull`. `loot-core` alone is ~49k lines; every task needs code spread across several modules.

## Tasks

| Task | Type | Area | What makes it hard |
|---|---|---|---|
| AB1 | bugfix (seeded) | rules ranking | Symptom points at rule matching (`condition.ts`); the cause is the ranking comparator in `rule-utils.ts`. The one test that would reveal it is removed from the start state. |
| AB2 | feature | rule conditions | New operator ripples through types, shared op tables, the matcher, ranking and AQL conversion. Trap: the app's `$like` is unanchored (`unicodeLike.ts`), so the obvious filter implementation is wrong. |
| AB3 | feature | schedules + API | Crosses `packages/api` → `server/api.ts` → handler types. Reusing the existing `getScheduleDates` helper gets weekend moves, month skips and dedupe right; reimplementing it doesn't. |
| AB4 | bugfix (seeded) | envelope budget | Cause is in the spreadsheet formulas of `envelope.ts`; the visible failing tests are about budget actions (`actions.test.ts`), and `tracking.ts` looks similar. |

## Layout

```
suite.json            repo, pinned commit, task list
profile.md            environment description given to the agent (all arms)
tasks/<id>/spec.md    task spec (the only task file the agent sees)
tasks/<id>/task.json  ground truth: relevant files, regression scope, expected start failures (hidden)
tasks/<id>/start.patch      seeded defect applied to the start state (hidden)
tasks/<id>/reference.patch  known-good solution used for validation (hidden)
acceptance/           black-box tests through @actual-app/api built from the workspace (hidden)
scripts/              pristine.sh, prepare.sh, evaluate.sh (hidden)
```

## Evaluation (per run)
1. **Regression:** the repo's own tests for the task's scope, restored from the pinned commit over the workspace's copies, so editing or deleting tests can't make a run pass. Reported as rule `<task> regression`.
2. **Acceptance:** `@actual-app/api` is built from the workspace and driven by `acceptance/tests/<task>.test.ts`.
3. **Reading precision (P1):** share of `Read` output that came from the task's ground-truth relevant files, and the share of core files read at least once.

## Isolation
The workspace is the source at the pinned commit (plus `start.patch`) with a fresh git repo whose only commit is the start state: no upstream history. In CI everything hidden, including the pristine upstream clone, is deleted before the agent starts. Runs where the agent reaches the network from Bash are flagged (`agent.networkCommands`).

## Validation
`harness/validate-actual.sh [TASK…]` runs every task twice through the real runner: the start state must fail exactly `expectStartFailing`, the reference patch must pass everything. CI: `validate-actual` workflow.

## Cost and time
Per run, outside the agent: ~1.5 min prepare (with the Yarn cache), ~1 min evaluate. Each workspace has ~1.7 GB of `node_modules`.
