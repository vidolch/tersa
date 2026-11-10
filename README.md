# Tersa

R&D on making coding agents cheaper without making them worse. Two ideas, kept separable so each can be adopted on its own:

1. **A query layer** (`query/`): batched, symbol-level code queries over an existing codebase, served to the agent as an MCP server. Works on plain TypeScript today; no new language needed.
2. **An LLM-first language** (later): a strict TypeScript dialect with verified contracts and effects, transpiled to TypeScript.

Everything is measured by the benchmark in this repo, so each idea has to prove it reduces **cost per passing task**. Every iteration (hypothesis, change, results, conclusion) is logged in [`docs/iterations.md`](docs/iterations.md).

## Arms

| Arm | Language | Agent tooling | Status |
|---|---|---|---|
| **A** `A-ts-baseline` | TypeScript | Claude Code's standard tools (Read, Edit, Write, Grep, Glob, Bash) | baseline measured |
| **B** `B-ts-query` | TypeScript | standard tools + the tersa query layer (`query/`), steered: usage note in the system prompt; code-reading shell/Grep/Glob calls and whole-file Reads of large source files redirected to the query tools or ranged Reads | measured: no gain with DeepSeek, more expensive with Haiku (see `docs/iterations.md`) |
| **B2** `B2-ts-query-shell` | TypeScript | standard tools + the query layer as a `tersa` shell command (daemon keeps the index warm), usage note in the system prompt, no redirects, so lookups batch with other shell commands in one turn | piloted: not adopted by Haiku |
| **D** `D-ts-bundle` | TypeScript | standard tools + a ~6k-token context bundle in the first prompt, built automatically from the spec (`query/src/bundle.ts`) | iteration 10: no cost gain |
| **F** `F-ts-exhaustive` | TypeScript, with one language rule applied by hand: dispatch over a closed set is exhaustive (`assertNever`, typed operator lists), so adding a member breaks the build at every place that must handle it (`arms/F-ts-exhaustive/patches/`, behaviour-preserving, AB2 only) | Claude Code's standard tools | iteration 13 |
| **G** `G-ts-agreement` | TypeScript, plus one test standing in for the language rule "one definition per operator": every string operator listed in the code is run through both the rule matcher and the filter query on the same data, and must agree (`arms/G-ts-agreement/patches/`, AB2 only) | Claude Code's standard tools | iteration 14 |
| **C** `C-tersa-lang` | Tersa → TypeScript | standard tools + query layer + language | not started |

**B vs A** isolates the query layer. **F vs A** and **G vs A** each test one language rule without building the language. **C vs B** isolates the language. Everything else is identical between arms: model, harness, specs, caps, network policy and environment description. Arm B differs by its tools and their steering, defined in `arms/B-ts-query/agent.json` and `harness/runner/src/steering.ts`: the usage note (counted as overhead) and a hook that denies code-reading calls the query tools cover, replying with the equivalent query call. Read stays allowed (Claude Code requires a Read before an Edit), as do tests, builds, git and non-code files.

## Problems tracked

| ID | Problem | Measured by |
|---|---|---|
| P1 | Reading cost: irrelevant reads, re-reads, round trips | input tokens, turns, reading precision |
| P2 | Wrong code → retries | compile/test failures per run |
| P3 | Unknown or hallucinated APIs | compile errors on unknown symbols |
| P4 | Fragile edits | failed edit calls |
| P6 | Noisy tool output | tokens in tool results |
| P8 | Context decay in long sessions | chained-run pass rate, compactions |

P0 (building the wrong thing) is out of scope; specs are written to be unambiguous so it doesn't add noise.

## Suites

| Suite | Codebase | Tasks | Purpose |
|---|---|---|---|
| `urlshort` | URL shortener written for the benchmark (~500 lines) | T1–T5: build, feature, bugfix, refactor, fresh-session change | small control; validates the pipeline |
| `actual` | [Actual Budget](https://github.com/actualbudget/actual) (MIT), ~49k lines in `loot-core`, pinned commit | AB1–AB4: two seeded bugs, two cross-module features | where reading cost shows; see `suites/actual/README.md` |

Every run is evaluated by hidden tests the agent never sees: black-box HTTP tests for `urlshort`, and tests through the public `@actual-app/api` package for `actual`. Both suites also run the project's own tests, restored from the original before checking.

## Metrics

- **Primary:** cost per passing task = total USD ÷ runs that pass every rule (regression included).
- **Secondary:** tokens by billing class, turns, tool calls by tool, reading precision and core recall (`actual`), repeat reads, failed edits, compile failures, wall time, per-rule pass rates.
- **Reading precision:** of everything the agent read (Read, Grep, code-reading shell commands, and query-tool output), the share that came from the task's ground-truth relevant files.

## Running it

Everything runs in GitHub Actions; no local machine is needed.

| Workflow | Trigger | What it does | Cost |
|---|---|---|---|
| `ci` | every push | self-check of the urlshort suite through the real pipeline; query-layer typecheck and tests | free |
| `validate-actual` | push to the Actual suite, harness or query layer | every Actual task: the start state fails exactly as expected and the reference fix passes; the query layer reaches every task's core files | free |
| `bench-baseline` | manual | arm A batch: suite × tasks × runs | API credits |
| `bench-query` | manual | arm B or B2 batch, same steps (`_bench.yml` is shared) | API credits |
| `summary` | after each batch, or a push to `results/` | rebuilds `results/summary.md` (one at a time, so batches never conflict) | free |

Run **both arms in the same period**: providers can update a model behind the same name, and a same-day baseline rules that out as an explanation.

Batch results are committed to `results/<arm>/<task>/run-<n>.json` and summarized in `results/summary.md`. Transcripts and logs are kept as workflow artifacts for 30 days.

Secrets: `DEEPSEEK_API_KEY` (currently used) or `ANTHROPIC_API_KEY`. Each run has a hard spending cap (`max_budget_usd`, default $0.50).

## How a run is kept honest

- **Hidden tests and answers:** the agent's workspace is built from the start state only. Tests, reference solutions, ground truth and the pristine upstream copy are deleted from the runner before the agent starts, and evaluation uses a fresh checkout afterwards.
- **Tests can't be gamed:** the project's original tests are copied back over the agent's versions before scoring.
- **Provider-only network:** the agent runs as a separate Linux user whose only network path is a local proxy that tunnels to the model API. A CI step proves github.com is unreachable before each run. Runs that used the network without this policy are reported as invalid.
- **Crashes aren't failures:** a provider error mid-run is recorded as a crash and listed, not scored.
- **Bounded runs:** 150 turns, a spending cap per run, and a 30-minute wall-clock limit; a run that hits a limit counts as failed. Progress (turn, tokens, cost, API retries) is printed live in the job log.
- **Self-checks:** every suite has a fake-agent check (the known-good solution plays the agent), so a harness bug shows up in CI instead of in the results.

Details: `harness/PROTOCOL.md`.

## Findings so far

Arm A, `deepseek-v4-flash`, provider-only network, 6 runs per task (2026-11-03):

| Task | Pass | Median cost | Turns | Input tokens | Reading tokens | Files read | Read precision |
|---|---|---|---|---|---|---|---|
| AB1 ranking bug | 6/6 | $0.019 | 58 | 2.0M | 44k | 39 | 30% |
| AB2 `startsWith` | 6/6 | $0.023 | 98 | 3.0M | 40k | 98 | 35% |
| AB3 upcoming API | 6/6 | $0.017 | 65 | 1.8M | 28k | 41 | 25% |
| AB4 budget bug | 6/6 | $0.009 | 35 | 0.6M | 20k | 28 | 35% |

- **Most reading is irrelevant:** 65–75% of what the agent reads is outside the task's relevant files.
- **Context is re-sent every turn:** a run reads 20–44k tokens, but total input is 0.6–3M, because everything read stays in context and is paid for again on each later turn. Reading less and taking fewer turns both compound.
- **Quality is at the ceiling** (24/24): arm B has to win on cost, turns and reading without losing passes.
- **Run-to-run variance** in cost is 12–27%, so 6 runs per arm can detect a difference of roughly 25–30%.
- **The query layer reaches every task's core files in one or two queries** (200–600 tokens of output, `query/test/actual.test.ts`).
- **Steering made the tools used, but not cheaper (v1):** with the system-prompt note and redirects, the agent made 12–25 query calls per run, yet every task cost the same or more than arm A (AB1 $0.035 vs $0.019, and it broke an existing test). Agents still made 7–34 Read calls: Claude Code requires a Read before an Edit, so changed code is read twice. v1.1 trims query output; an edit tool in the query layer would remove the second read.
- **A context bundle up front shortens orientation but doesn't lower cost — iteration 10 (arm D, Haiku, 6 runs per task):** first edit earlier on AB3 (turn 9.3 → 5.4) and AB4 (5.0 → 3.5); cost per pass $0.0282 vs A $0.0261 (+8%), no task significant. The ~6k-token bundle is re-sent every turn and eats the turns it saves. AB1 fails 0/6 in both arms on the same regression test.
- **The low-effort failure is a lying primitive, not a missed place — iteration 13 (arm F vs A, AB2, 12 runs each):** making operator dispatch exhaustive changed nothing (6/12 vs 4/12, p = 0.68, same cost). Every run found and edited every place; pass/fail is decided entirely by whether the filter uses `$like` (always fails: Actual's `$like` is silently unanchored, so `rent%` matches "Not rent") or an anchored regexp (always passes). Language lessons: no misleading names in the core vocabulary, and one definition of each operator's meaning instead of separate in-memory and query versions.
- **Lower effort halves the cost but loses completeness — iteration 12:** `effort=low` on Haiku: $0.0116 vs $0.0235 per pass (−51%, significant on every task), half the turns, same output per turn. Passes 16 vs 19: AB2's filter path (R5) fails in 2 of 6 runs. `thinking=disabled` doesn't take effect (thinking blocks still present).
- **Where Haiku's cost goes — iteration 11:** output 38%, cache writes 23%, cache reads 38%. Old tool output carried in context is only ~12%; the fixed per-turn context (system prompt, tools, own messages) is ~17k tokens. Trimming tool output can't save much; turns and output size are the levers.
- **On Claude Haiku 5.5 the query layer makes the agent significantly more expensive — iteration 8:** +24% to +126% per task (3 of 4 at p ≤ 0.016), turns up to 2× (AB3: 21 → 49), no gain in pass rate. Haiku reads only 7–18k tokens per run, mostly through compound shell commands that already batch lookups; the tools split that into more calls and turns. With DeepSeek (iteration 7) there was no difference. **Conclusion: the lever is turns, not bytes read.**
- **The query layer (v1.2) does not lower cost with DeepSeek — iteration 7, 6 runs per task per arm:** B $0.0166 per pass vs A $0.0158 (+5%); per task −14% to +28%, none significant (p 0.09–0.46), all 48 runs passing. Query output replaced file reading one-for-one, read precision didn't improve, and B took more turns. The iteration 6 pilot (−35% on AB3) was noise. Cost is driven by turns × context size, which a better reading interface alone doesn't change.
- **Tools alone weren't adopted:** in the first arm B pilot (usage note in the task prompt only) the agent made 2–4 query calls out of ~50 tool calls and kept using grep/cat/sed. Steering was added to the harness for arm B (system-prompt note plus redirects).
- The `urlshort` control: 26/26 runs passed at about $0.01 each, with almost no reading. It's too small to separate the arms, which is why the `actual` suite exists.

## Incident log

What went wrong, how it was caught, and what changed. Invalidated records are kept under `results/archive/`.

| Date | What happened | Caught by | Fix |
|---|---|---|---|
| 2026-11-03 | T4 failed 5/5 with no failing rule: the harness set `STORAGE=""` instead of leaving it unset, and the evaluator dropped tests that were skipped because the service never started | a failure without a reason | unset in harness; skipped-because-crashed counts as failed; fixtures in `harness/fixtures/` |
| 2026-11-03 | First bench run crashed at the summary step when no records came back | run log | report creates `results/` |
| 2026-11-03 | Seeded bug for AB1 (rule indexer) had no visible effect through the API: every rule also lands in a catch-all index | hidden test passed on seeded code | AB1 moved to the rule-ranking comparator |
| 2026-11-03 | Two runs crashed at the same moment on a DeepSeek connection drop; the runner died and no record was written | missing records | crashes recorded (`error_agent_crash`) and listed, not scored; SDK stderr saved |
| 2026-11-03 | **An agent downloaded the upstream file with `curl` and diffed it against the seeded workspace** (AB1 run 5; run 1 likely the same). It found the repo URL in `AGENTS.md` and the version in `package.json` | network-command flag | provider-only network per run; profile says no network; contaminated runs invalid; Actual baseline archived and rerun |
| 2026-11-03 | Arm A and arm B batches finished together; both rewrote `results/summary.md`, arm B's commit hit a merge conflict, and the retry loop still reported success, so B's records were dropped | missing records | batches commit only their own record files; `summary` workflow rebuilds the summary; failed pushes fail the job |
| 2026-11-09 | A run that hit the turn limit would have been recorded as a crash (not scored) instead of a failure: the SDK throws on max turns | mock test for arm B2 | recorded as `error_max_turns`, scored as failed; no past records affected |
| 2026-11-09 | Recorded Claude costs undercounted output: per-request pricing read output tokens from the stream's start event (a placeholder) | recorded total below the SDK totals priced at the lowest rates | final output counts read from stream `message_delta` events; iteration 8 reported with both measures |
| 2026-11-09 | First Claude (Haiku 5.5) pilot: one arm A run sat in the agent step for 40 minutes with an empty log, and transcripts are only downloadable afterwards | wall-clock time; cancelled by hand | a progress line per turn and every API retry in the live log; 30-minute wall-clock limit per run (recorded as `error_wall_timeout`, counted as a failed run in both arms) with the last tool calls printed |
| 2026-11-03 | Reading metric counted only the Read tool, but agents read mostly via `sed`/`cat`/`grep`: one run showed 0 tokens read | implausible numbers | shell, Grep and query-tool output attributed to files |
| 2026-11-09 | Three same-arm batches dispatched together: the concurrency group was per arm, so GitHub cancelled the middle one while it was pending | Run list showed it cancelled | Group per arm and first run; batches of one arm with different run numbers now run side by side |

## Layout

```
query/          the query layer: CONTRACT.md (interface contract), src/, tests
suites/actual/  Actual Budget suite: specs, hidden tests, seeded patches, ground truth, scripts
specs/          urlshort task specs (frozen)
acceptance/     urlshort hidden HTTP tests
perf/           urlshort load profile (k6)
reference/      urlshort reference solutions = start states (hidden)
arms/           per-arm agent config (tools, MCP servers, usage notes) and urlshort profiles/scaffold
harness/        runner, run-record schema, protocol, self-checks, sandbox (egress proxy), fixtures
results/        run records, summary.md, archive/ of invalidated batches
```

## Status

- [x] Benchmark harness: runner, run records, spending cap, crash handling, report
- [x] `urlshort` suite with reference solutions and self-check
- [x] `actual` suite: 4 tasks, hidden tests, ground truth, self-check
- [x] Honest runs: hidden material removed, tests restored, provider-only network
- [x] Arm A baseline on `actual` (DeepSeek Flash, 24 runs)
- [x] Query layer v1: contract, TypeScript indexer, MCP server, tests
- [x] Arm B pilot without steering: tools barely used
- [x] Arm B steering: system-prompt note, redirect hook, redirect counts in records
- [x] Arm B pilot with steering: adoption 12–25 query calls per run, but cost up (1 run per task, archived)
- [x] Per-tool token accounting (calls, output tokens, carried tokens) in run records
- [x] Query layer v1.1: leaner defaults
- [x] Arm B v1.1 pilot with a same-period arm A run: whole-file Reads are 50–85% of carried input in both arms
- [x] Iteration log with regenerable tables (`docs/iterations.md`, `harness/runner/src/compare.ts`)
- [x] Iteration 6: steering v1.2 pilot: B no longer more expensive than A; cheaper on AB2/AB3 (1 run each)
- [x] Iteration 7: full comparison, B v1.2 vs same-period A, 6 runs per task: no significant difference (B +5% per pass)
- [x] Iteration 8: same comparison on Claude Haiku 5.5: B significantly more expensive (+24% to +126%)
- [x] Iteration 9: query layer as a shell command (arm B2): not adopted (0–4 calls per run); query-layer line closed
- [x] Iteration 10: task-scoped context bundle up front (arm D): earlier first edit on AB3/AB4, but cost per pass +8%, not significant
- [x] Iteration 11: cost anatomy on Haiku: old tool output ~12% of cost; `turnsToFirstEdit` fixed to count shell edits
- [x] Iteration 12: `effort=low` halves cost per pass (−51%, p ≤ 0.016 on every task) but misses a second code path (AB2 R5, 4/6); `thinking=disabled` has no effect
- [x] Iteration 13: arm F (exhaustive dispatch) vs A on AB2 at `effort=low`: no effect; failures come from the `$like` trap, not omissions (iteration 12's reading corrected)
- [ ] Iteration 14: arm G (matcher/filter agreement test) vs A on AB2 at `effort=low`
- [ ] Arm B batch on `actual`, with a same-day arm A rerun
- [ ] Compare B vs A; decide what the query layer needs next
- [ ] Headline run on a Claude model
- [ ] Arm C (language)
