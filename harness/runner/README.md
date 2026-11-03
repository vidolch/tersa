# Runner

Runs one agent session on one task in one arm, evaluates it with the hidden acceptance suite (and perf if `k6` is installed), and writes a run record that validates against `../run-record.schema.json`.

## Setup
```
cd harness/runner && npm install
export ANTHROPIC_API_KEY=...        # used by the Claude Agent SDK
```

## Commands
```
# Actual Budget suite (tasks AB1..AB4)
npm run run -- --suite actual --arm A-ts-baseline --task AB2 --run 1 --provider deepseek

# one independent run (fresh workspace from the task's start state)
npm run run -- --arm A-ts-baseline --task T2 --run 1 --model claude-sonnet-5-5

# chained run: T1 builds the workspace, T2..T5 continue in it (fresh session each task)
npm run run -- --arm A-ts-baseline --task T1 --chained

# pipeline check without an API call: a reference solution plays the agent
npm run run -- --arm A-ts-baseline --task T3 --run 1 --fake-agent ../../reference/T3-start

# aggregate into results/summary.md
npm run report
```

Options: `--max-turns` (default 150), `--skip-perf`, `--force` (overwrite an existing record), `--raw-dir` (workspaces and logs outside the repo).

### Phases
`--phase prepare|agent|eval` runs one step of a run (default: all three). CI uses this to delete `acceptance/`, `reference/`, `perf/` and `.git` from disk before the agent starts, then evaluates from a fresh checkout. Locally, the agent could in principle read the hidden tests, so run real benchmarks in CI or a container.

## GitHub Actions
- **ci** (every push): `harness/validate.sh` typechecks everything and plays each task with its reference solution through the phased pipeline. Free, no API key.
- **bench** (manual, Actions → bench → Run workflow): matrix of tasks × runs for one arm. Needs the repository secret `ANTHROPIC_API_KEY`. Choose the provider when starting it: `anthropic` (secret `ANTHROPIC_API_KEY`) or `deepseek` (secret `DEEPSEEK_API_KEY`). Records are committed to `results/`, transcripts and logs are kept as workflow artifacts for 30 days. Perf is skipped on shared runners.

## Providers
`--provider anthropic|deepseek` (default anthropic). DeepSeek runs Claude Code against DeepSeek's Anthropic-compatible endpoint with `DEEPSEEK_API_KEY`; background model calls use the same model, so nothing goes to Anthropic. Its cost is recomputed from `harness/prices.json` (`costSource` in the record). Compare token counts and cost only between runs of the same model: DeepSeek caches differently from Claude. The report groups by model.

## Outputs
- `results/<arm>/<task>/run-<n>.json`: run record (commit these)
- `results/<arm>/chain/<task>.json`: chained run records
- `results/raw/...`: workspace, transcript.jsonl, acceptance and perf logs (gitignored)

## What the agent gets
The prompt is the arm profile, the arm's `contextFiles`, and the task spec. Nothing else: no user settings or CLAUDE.md (`settingSources: []`), only the tools listed in `arms/<arm>/agent.json`, and permissions bypassed inside the throwaway workspace.

## Metric heuristics (same for every arm)
- `repeatReads`: `Read` of a path+range already read in this run.
- `failedEdits`: `Edit`/`Write` tool results with `is_error`.
- `compileFailures`: failing `Bash` commands that run `tsc`, `typecheck` or a build.
- `testRuns`: `Bash` commands that run a test runner.
- `toolResultTokens`, `contextOverheadTokens`: characters ÷ 4 (estimates).
- Token usage and cost come from the SDK's `modelUsage` and `total_cost_usd`, which include subagent and compaction calls.

## Arms
An arm runs only if its `agent.json` has `"ready": true`. B and C are blocked until the query layer and the language exist.
