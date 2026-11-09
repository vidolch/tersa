# Iteration log

One entry per iteration: what we expected, what changed, how it was run, what came out, and what we concluded. Tables are generated from the committed records with `harness/runner/src/compare.ts`; each entry lists the exact command, so it can be regenerated for a retrospective.

Columns: medians per task, crashed runs excluded. *Reading* = output of Read, Grep, code-reading shell commands and query tools (from iteration 2 on; iteration 0–1 counted Read only). *Read share of carried* = Read's share of all tool output weighted by the turns it stayed in context (recorded from iteration 5 on).

Model in every iteration: `deepseek-v4-flash` through DeepSeek's Anthropic-compatible API, Claude Agent SDK 0.3.310, max 150 turns.

---

## Iteration 0 — urlshort baseline (control)
**Date** 2026-11-03 · **Arms** A · **Records** `results/A-ts-baseline/T1..T5`

**Goal.** Validate the pipeline end to end on a small codebase written for the benchmark.

**Result.**
| Task | Group | Runs | Pass | Median cost | Median turns | Median input | Median reading | Read precision | Query calls | Redirects | Read share of carried |
|------|-------|------|------|-------------|--------------|--------------|----------------|----------------|-------------|-----------|-----------------------|
| T1 | A | 6 | 6/6 | $0.011 | 37.5 | 0.64M | – | – | 0 | 0 | – |
| T2 | A | 5 | 5/5 | $0.009 | 31 | 0.38M | – | – | 0 | 0 | – |
| T3 | A | 5 | 5/5 | $0.003 | 13 | 0.11M | – | – | 0 | 0 | – |
| T4 | A | 5 | 5/5 | $0.011 | 33 | 0.60M | – | – | 0 | 0 | – |
| T5 | A | 5 | 5/5 | $0.010 | 31 | 0.62M | – | – | 0 | 0 | – |

`node src/compare.ts "A=results/A-ts-baseline" --suite urlshort`

**Conclusion.** The pipeline works and runs are cheap (~$0.01). Everything fits in context, so there is almost no reading to save: too small to separate arms. → Build a suite on a real, large codebase.

**Incidents.** T4 first failed 5/5 because the harness set `STORAGE=""` and the evaluator dropped skipped tests (fixed, fixtures added; those records were deleted and rerun).

---

## Iteration 1 — Actual baseline, unrestricted network (invalid)
**Date** 2026-11-03 · **Arms** A · **Records** `results/archive/2026-11-03-actual-pre-isolation/`

**Goal.** First baseline on Actual Budget (AB1–AB4), after a pilot of one run per task.

**Result.**
| Task | Group | Runs | Pass | Median cost | Median turns | Median input | Median reading | Read precision | Query calls | Redirects | Read share of carried |
|------|-------|------|------|-------------|--------------|--------------|----------------|----------------|-------------|-----------|-----------------------|
| AB1 | A (pre-isolation) | 6 | 6/6 | $0.020 | 60 | 2.25M | 31k | 46% | 0 | 0 | – |
| AB2 | A (pre-isolation) | 6 | 5/6 | $0.019 | 80.5 | 2.33M | 16k | 64% | 0 | 0 | – |
| AB3 | A (pre-isolation) | 6 | 6/6 | $0.016 | 65 | 1.47M | 5k | 63% | 0 | 0 | – |
| AB4 | A (pre-isolation) | 6 | 6/6 | $0.013 | 52.5 | 1.28M | 8k | 60% | 0 | 0 | – |

`node src/compare.ts "A (pre-isolation)=results/archive/2026-11-03-actual-pre-isolation/A-ts-baseline" --suite actual`

**Conclusion.** Invalid. In AB1 run 5 (and very likely run 1) the agent `curl`ed the upstream `rule-utils.ts` from GitHub and diffed it against the seeded workspace; it found the repo in `AGENTS.md` and the version in `package.json`. The reading metric also counted only the Read tool, so reading and precision here are not comparable with later iterations. → Provider-only network for the agent, network rule in the profile, reading metric over shell/Grep output.

---

## Iteration 2 — Actual baseline, provider-only network
**Date** 2026-11-03 · **Arms** A · **Records** `results/A-ts-baseline/AB*/run-1..6`

**Change.** Agent runs as a separate user whose only egress is a proxy to the model API (verified before each run); profile states the network rule; reading metric attributes shell, Grep and (later) query-tool output to files.

**Result.**
| Task | Group | Runs | Pass | Median cost | Median turns | Median input | Median reading | Read precision | Query calls | Redirects | Read share of carried |
|------|-------|------|------|-------------|--------------|--------------|----------------|----------------|-------------|-----------|-----------------------|
| AB1 | A | 6 | 6/6 | $0.018 | 58 | 2.03M | 44k | 30% | 0 | 0 | – |
| AB2 | A | 6 | 6/6 | $0.023 | 98 | 2.99M | 40k | 35% | 0 | 0 | – |
| AB3 | A | 6 | 6/6 | $0.017 | 65 | 1.82M | 28k | 25% | 0 | 0 | – |
| AB4 | A | 6 | 6/6 | $0.009 | 35 | 0.62M | 20k | 35% | 0 | 0 | – |

`node src/compare.ts "A=results/A-ts-baseline@1-6" --suite actual`

**Conclusion.** Clean baseline: 24/24 passed, no network attempts. 65–75% of reading is outside the task's relevant files, and total input (0.6–3M) is 20–70× the reading (20–44k) because context is re-sent every turn. Quality is at the ceiling, so arm B must win on cost/turns/reading without losing passes. Cost varies 12–27% between runs.

---

## Iteration 3 — Arm B v1, tools only
**Date** 2026-11-03 · **Arms** B (1 run per task) vs iteration 2 · **Records** `results/archive/2026-11-03-armB-no-steering/`

**Hypothesis.** Batched symbol-level queries replace file reading, cutting turns and input.

**Change.** Query layer v1 (`query/`, contract v1) as an MCP server; usage note appended to the task prompt.

**Result.**
| Task | Group | Runs | Pass | Median cost | Median turns | Median input | Median reading | Read precision | Query calls | Redirects | Read share of carried |
|------|-------|------|------|-------------|--------------|--------------|----------------|----------------|-------------|-----------|-----------------------|
| AB1 | A | 6 | 6/6 | $0.018 | 58 | 2.03M | 44k | 30% | 0 | 0 | – |
| AB1 | B v1 (no steering) | 1 | 1/1 | $0.017 | 54 | 1.97M | 42k | 17% | 4 | 0 | – |
| AB2 | A | 6 | 6/6 | $0.023 | 98 | 2.99M | 40k | 35% | 0 | 0 | – |
| AB2 | B v1 (no steering) | 1 | 1/1 | $0.019 | 76 | 2.34M | 33k | 37% | 2 | 0 | – |
| AB3 | A | 6 | 6/6 | $0.017 | 65 | 1.82M | 28k | 25% | 0 | 0 | – |
| AB3 | B v1 (no steering) | 1 | 1/1 | $0.013 | 57 | 1.38M | 24k | 30% | 3 | 0 | – |
| AB4 | A | 6 | 6/6 | $0.009 | 35 | 0.62M | 20k | 35% | 0 | 0 | – |
| AB4 | B v1 (no steering) | 1 | 1/1 | $0.009 | 38 | 0.74M | 20k | 38% | 4 | 0 | – |

`node src/compare.ts "A=results/A-ts-baseline@1-6" "B v1 (no steering)=results/archive/2026-11-03-armB-no-steering/B-ts-query" --suite actual`

**Conclusion.** The tools were barely used (2–4 calls of ~50); the agent kept grep/cat/sed, so B behaved like A. A tool the model isn't pushed toward doesn't get adopted. → Steering in the harness.

---

## Iteration 4 — Arm B v1, steered
**Date** 2026-11-03 · **Arms** B (1 run per task) vs iteration 2 · **Records** `results/archive/2026-11-03-armB-v1-steered/`

**Change.** Usage note moved to the system prompt; a PreToolUse hook denies code-reading Bash/Grep/Glob calls and replies with the equivalent query call (Read, tests, builds, git and non-code files stay allowed).

**Result.**
| Task | Group | Runs | Pass | Median cost | Median turns | Median input | Median reading | Read precision | Query calls | Redirects | Read share of carried |
|------|-------|------|------|-------------|--------------|--------------|----------------|----------------|-------------|-----------|-----------------------|
| AB1 | A | 6 | 6/6 | $0.018 | 58 | 2.03M | 44k | 30% | 0 | 0 | – |
| AB1 | B v1 steered | 1 | 0/1 | $0.035 | 96 | 5.32M | 51k | 21% | 25 | 6 | – |
| AB2 | A | 6 | 6/6 | $0.023 | 98 | 2.99M | 40k | 35% | 0 | 0 | – |
| AB2 | B v1 steered | 1 | 1/1 | $0.024 | 84 | 3.30M | 47k | 31% | 18 | 6 | – |
| AB3 | A | 6 | 6/6 | $0.017 | 65 | 1.82M | 28k | 25% | 0 | 0 | – |
| AB3 | B v1 steered | 1 | 1/1 | $0.017 | 76 | 2.02M | 28k | 25% | 12 | 7 | – |
| AB4 | A | 6 | 6/6 | $0.009 | 35 | 0.62M | 20k | 35% | 0 | 0 | – |
| AB4 | B v1 steered | 1 | 1/1 | $0.011 | 41 | 0.97M | 21k | 33% | 12 | 3 | – |

`node src/compare.ts "A=results/A-ts-baseline@1-6" "B v1 steered=results/archive/2026-11-03-armB-v1-steered/B-ts-query" --suite actual`

**Conclusion.** Adoption worked (12–25 query calls), cost didn't: every task the same or more expensive, AB1 nearly double and it broke an existing test. Agents still made 7–34 Read calls, so query output came on top of file reading. Suspected: Read-before-Edit, verbose query defaults, redirect friction. → Per-tool accounting to find out; leaner defaults.

---

## Iteration 5 — Query v1.1 (leaner), per-tool accounting, same-period A
**Date** 2026-11-03 · **Arms** A run 7 and B (1 run per task each, same period) · **Records** `results/A-ts-baseline/AB*/run-7`, `results/archive/2026-11-03-armB-v1.1/`

**Change.** Contract v1.1: `code_find` 12 symbols × 3 lines (was 30 × 5), `code_get` 120 lines, 5 callers, compact `uses`. Records now carry per-tool calls, output tokens and carried tokens.

**Result.**
| Task | Group | Runs | Pass | Median cost | Median turns | Median input | Median reading | Read precision | Query calls | Redirects | Read share of carried |
|------|-------|------|------|-------------|--------------|--------------|----------------|----------------|-------------|-----------|-----------------------|
| AB1 | A (same period) | 1 | 1/1 | $0.018 | 53 | 1.91M | 48k | 28% | 0 | 0 | 85% |
| AB1 | B v1.1 | 1 | 1/1 | $0.021 | 55 | 2.47M | 50k | 16% | 11 | 5 | 84% |
| AB2 | A (same period) | 1 | 0/1 | $0.017 | 82 | 1.86M | 36k | 39% | 0 | 0 | 72% |
| AB2 | B v1.1 | 1 | 1/1 | $0.026 | 103 | 3.94M | 39k | 34% | 19 | 5 | 50% |
| AB3 | A (same period) | 1 | 1/1 | $0.014 | 68 | 1.48M | 21k | 27% | 0 | 0 | 0% |
| AB3 | B v1.1 | 1 | 1/1 | $0.029 | 117 | 4.40M | 33k | 24% | 22 | 11 | 38% |
| AB4 | A (same period) | 1 | 1/1 | $0.011 | 45 | 0.91M | 24k | 41% | 0 | 0 | 67% |
| AB4 | B v1.1 | 1 | 1/1 | $0.010 | 41 | 0.78M | 20k | 34% | 5 | 4 | 51% |

`node src/compare.ts "A (same period)=results/A-ts-baseline@7" "B v1.1=results/archive/2026-11-03-armB-v1.1/B-ts-query" --suite actual`

**Conclusion.** Per-tool data: **whole-file Reads are 50–85% of carried input in both arms**, and B still made 13–32 Reads with about the same output; query output was added on top. Redirect friction was high in AB3 (11 redirects, 117 turns). A local test showed a partial Read (offset/limit) is enough for Claude Code to allow an Edit, so no separate edit tool is needed. → v1.2: redirect whole-file Reads of large source files, show exact edit ranges, explain the rules once.

**Incidents.** Both batches finished together and rewrote `results/summary.md`; arm B's commit conflicted and its records were dropped while the job reported success. Batches now commit only their records; a separate workflow builds the summary. B was rerun.

---

## Iteration 6 — Steering v1.2: no whole-file Reads of large source files
**Date** 2026-11-03 · **Arms** A run 8 and B (1 run per task each, same period) · **Records** `results/A-ts-baseline/AB*/run-8`, `results/B-ts-query/AB*/run-1` (B v1.2)

**Hypothesis.** Most of B's carried input is whole-file Reads. If large source files can only be read as ranges, with `code_get` giving exact ranges, B's input and cost fall below A's without losing passes.

**Change.** Steering v1.2 (`harness/runner/src/steering.ts`): a Read of a source file over 150 lines without a range (or with a range over 300 lines) is redirected to `code_outline`/`code_get` or a ranged Read; ranged Reads, small files and non-code files are allowed. The first redirect of a run explains all rules once. Query contract v1.2: `code_get` headers carry the exact Read range for editing the symbol (`to edit: Read offset S limit N`). Usage note updated accordingly.

**Result.** Same period:
| Task | Group | Runs | Pass | Median cost | Median turns | Median input | Median reading | Read precision | Query calls | Redirects | Read share of carried |
|------|-------|------|------|-------------|--------------|--------------|----------------|----------------|-------------|-----------|-----------------------|
| AB1 | A (same period) | 1 | 1/1 | $0.012 | 48 | 1.14M | 25k | 30% | 0 | 0 | 23% |
| AB1 | B v1.2 | 1 | 1/1 | $0.017 | 69 | 2.07M | 29k | 17% | 23 | 6 | 61% |
| AB2 | A (same period) | 1 | 1/1 | $0.027 | 109 | 3.81M | 40k | 33% | 0 | 0 | 71% |
| AB2 | B v1.2 | 1 | 1/1 | $0.020 | 89 | 2.54M | 33k | 39% | 25 | 4 | 52% |
| AB3 | A (same period) | 1 | 1/1 | $0.023 | 87 | 3.03M | 39k | 17% | 0 | 0 | 1% |
| AB3 | B v1.2 | 1 | 1/1 | $0.011 | 50 | 0.81M | 20k | 33% | 9 | 2 | 44% |
| AB4 | A (same period) | 1 | 1/1 | $0.013 | 52 | 1.13M | 23k | 31% | 0 | 0 | 37% |
| AB4 | B v1.2 | 1 | 1/1 | $0.010 | 36 | 0.66M | 19k | 18% | 11 | 2 | 32% |

`node src/compare.ts "A (same period)=results/A-ts-baseline@8" "B v1.2=results/B-ts-query@1" --suite actual`

Against all 8 arm A runs and the previous B version:
| Task | Group | Runs | Pass | Median cost | Median turns | Median input | Median reading | Read precision | Query calls | Redirects | Read share of carried |
|------|-------|------|------|-------------|--------------|--------------|----------------|----------------|-------------|-----------|-----------------------|
| AB1 | A all (8 runs) | 8 | 8/8 | $0.017 | 55 | 1.87M | 44k | 30% | 0 | 0 | 54% |
| AB1 | B v1.1 (it.5) | 1 | 1/1 | $0.021 | 55 | 2.47M | 50k | 16% | 11 | 5 | 84% |
| AB1 | B v1.2 | 1 | 1/1 | $0.017 | 69 | 2.07M | 29k | 17% | 23 | 6 | 61% |
| AB2 | A all (8 runs) | 8 | 7/8 | $0.023 | 98 | 2.99M | 40k | 35% | 0 | 0 | 71% |
| AB2 | B v1.1 (it.5) | 1 | 1/1 | $0.026 | 103 | 3.94M | 39k | 34% | 19 | 5 | 50% |
| AB2 | B v1.2 | 1 | 1/1 | $0.020 | 89 | 2.54M | 33k | 39% | 25 | 4 | 52% |
| AB3 | A all (8 runs) | 8 | 8/8 | $0.017 | 67 | 1.82M | 28k | 25% | 0 | 0 | 1% |
| AB3 | B v1.1 (it.5) | 1 | 1/1 | $0.029 | 117 | 4.40M | 33k | 24% | 22 | 11 | 38% |
| AB3 | B v1.2 | 1 | 1/1 | $0.011 | 50 | 0.81M | 20k | 33% | 9 | 2 | 44% |
| AB4 | A all (8 runs) | 8 | 8/8 | $0.010 | 37.5 | 0.75M | 21k | 35% | 0 | 0 | 52% |
| AB4 | B v1.1 (it.5) | 1 | 1/1 | $0.010 | 41 | 0.78M | 20k | 34% | 5 | 4 | 51% |
| AB4 | B v1.2 | 1 | 1/1 | $0.010 | 36 | 0.66M | 19k | 18% | 11 | 2 | 32% |

`node src/compare.ts "A all (8 runs)=results/A-ts-baseline@1-8" "B v1.1 (it.5)=results/archive/2026-11-03-armB-v1.1/B-ts-query" "B v1.2=results/B-ts-query@1" --suite actual`

Per tool (B v1.2): Read output fell to 8–18k per run (v1.1: 10–40k); redirects 2–6 per run (v1.1: 4–11).

**Conclusion.** First version of B that is not more expensive than A: against arm A's 8-run medians it is equal on AB1 and AB4 and cheaper on AB2 (−13%) and AB3 (−35%, 50 turns vs 67), all 4 passing. Against the same-period A run it lost on AB1 (that A run was unusually cheap, $0.012 vs a $0.017 median), which shows why single runs can't decide this. Read is still the largest carried cost (32–61%), but smaller. → Iteration 7: the first real comparison, 6 runs per task for B v1.2 and a same-period A rerun.

---

## Iteration 7 — First full comparison: B v1.2 vs A
**Date** 2026-11-03 · **Arms** A runs 9–14 and B v1.2 runs 2–7, 6 runs per task each, started together (3 concurrent runs per arm) · **Records** `results/A-ts-baseline/AB*/run-9..14`, `results/B-ts-query/AB*/run-2..7`

**Hypothesis.** B v1.2 costs less than A at equal pass rate (iteration 6 pilot: −13% on AB2, −35% on AB3).

**Result.**
| Task | Group | Runs | Pass | Median cost | Median turns | Median input | Median reading | Read precision | Query calls | Redirects | Read share of carried |
|------|-------|------|------|-------------|--------------|--------------|----------------|----------------|-------------|-----------|-----------------------|
| AB1 | A (it.7) | 6 | 6/6 | $0.015 | 44.5 | 1.37M | 35k | 31% | 0 | 0 | 67% |
| AB1 | B v1.2 (it.7) | 6 | 6/6 | $0.013 | 55.5 | 1.33M | 23k | 25% | 16.5 | 4 | 40% |
| AB2 | A (it.7) | 6 | 6/6 | $0.022 | 90 | 2.83M | 38k | 37% | 0 | 0 | 58% |
| AB2 | B v1.2 (it.7) | 6 | 6/6 | $0.027 | 96 | 3.83M | 40k | 33% | 26 | 4 | 40% |
| AB3 | A (it.7) | 6 | 6/6 | $0.013 | 59.5 | 1.10M | 26k | 25% | 0 | 0 | 23% |
| AB3 | B v1.2 (it.7) | 6 | 6/6 | $0.017 | 74 | 1.94M | 27k | 28% | 16 | 4 | 37% |
| AB4 | A (it.7) | 6 | 6/6 | $0.011 | 47 | 0.84M | 23k | 29% | 0 | 0 | 42% |
| AB4 | B v1.2 (it.7) | 6 | 6/6 | $0.010 | 41 | 0.84M | 19k | 31% | 10 | 2.5 | 35% |

`node src/compare.ts "A (it.7)=results/A-ts-baseline@9-14" "B v1.2 (it.7)=results/B-ts-query@2-7" --suite actual`

Mean cost and a two-sided permutation test on the difference of means (20,000 shuffles):

| Task | A mean | B mean | Difference | p |
|---|---|---|---|---|
| AB1 | $0.0154 | $0.0133 | −14% | 0.46 |
| AB2 | $0.0224 | $0.0255 | +14% | 0.12 |
| AB3 | $0.0135 | $0.0172 | +28% | 0.09 |
| AB4 | $0.0120 | $0.0104 | −14% | 0.28 |

All 48 runs passed, no network attempts, no crashes. Totals: A $0.380 for 24 passes ($0.0158 per pass), B $0.398 ($0.0166 per pass, +5%).

**Conclusion.** Hypothesis rejected: no significant difference on any task, and the signs disagree. The pilot's gains were noise (AB3 went from −35% in the pilot to +28%). Why:
- Query output replaced Read output roughly one-for-one: Read's share of carried input fell (35–40% vs 23–67%), total reading stayed about the same.
- Read precision did not improve (25–33% vs 25–37%): the agent reads as broadly as before, through a different interface.
- B takes more turns on three of four tasks (redirects plus extra query calls), and every turn re-sends the context.

A better reading interface alone does not lower cost for this model. Cost is driven by turns × context size, and the tools change neither. Candidate directions: give the agent a task-scoped slice of the code up front (fewer orientation turns); test on a Claude model (DeepSeek rarely batched queries); keep context from growing (drop tool output once used).

**Statistics note.** Single-run pilots were misleading twice (iteration 6 vs 7). From now on a pilot only checks that a change works; claims about cost need 6+ runs per arm in the same period, reported with a test.

---

## Iteration 8 — Same comparison on Claude Haiku 5.5
**Date** 2026-11-09 · **Arms** A runs 16–21 and B v1.2 runs 9–14 on `claude-haiku-5-5`, 6 runs per task each, started together (3 concurrent per arm) · **Records** `results/A-ts-baseline/AB*/run-16..21`, `results/B-ts-query/AB*/run-9..14`

**Question.** Iteration 7 found no cost difference with DeepSeek Flash. Was that the model (DeepSeek rarely batched queries), or does the query layer not help in this form?

**Setup changes since iteration 7.** Claude pricing in `harness/prices.json` (per-request long-prompt tier for Haiku), per-provider spending cap ($3 for Claude), live progress and API-retry lines in the job log, 30-minute wall-clock limit per run (`error_wall_timeout`, counted as failed).

**Pilot** (A run 15, B run 8, one run per task; checks the setup only): all runs completed, no API retries. A Haiku was very fast on the bug tasks (AB4 18 turns, AB3 25); B was cheaper on AB1 and more expensive on AB2–AB4. A failed AB1 (regression).

`node src/compare.ts "A haiku=results/A-ts-baseline@15" "B haiku=results/B-ts-query@8" --suite actual --model claude-haiku-5-5`

**Incident.** In the pilot, one arm A run sat in the agent step for 40 minutes with an empty log and was cancelled by hand; that led to the progress lines and the wall-clock limit above.

**Result.** All 48 runs completed (no crashes, no API retries, no network attempts).
| Task | Group | Runs | Pass | Median cost | Median turns | Median input | Median reading | Read precision | Query calls | Redirects | Read share of carried |
|------|-------|------|------|-------------|--------------|--------------|----------------|----------------|-------------|-----------|-----------------------|
| AB1 | A haiku (it.8) | 6 | 0/6 | $0.010 | 29 | 0.61M | 9k | 37% | 0 | 0 | 0% |
| AB1 | B v1.2 haiku (it.8) | 6 | 1/6 | $0.016 | 37.5 | 0.97M | 12k | 39% | 14 | 3 | 29% |
| AB2 | A haiku (it.8) | 6 | 6/6 | $0.021 | 43.5 | 1.40M | 18k | 19% | 0 | 0 | 0% |
| AB2 | B v1.2 haiku (it.8) | 6 | 6/6 | $0.036 | 62.5 | 2.59M | 23k | 46% | 27 | 2 | 15% |
| AB3 | A haiku (it.8) | 6 | 6/6 | $0.008 | 22 | 0.42M | 9k | 4% | 0 | 0 | 0% |
| AB3 | B v1.2 haiku (it.8) | 6 | 6/6 | $0.020 | 47 | 1.33M | 15k | 45% | 13 | 4 | 17% |
| AB4 | A haiku (it.8) | 6 | 6/6 | $0.007 | 19.5 | 0.36M | 8k | 20% | 0 | 0 | 0% |
| AB4 | B v1.2 haiku (it.8) | 6 | 6/6 | $0.008 | 20.5 | 0.46M | 10k | 34% | 6 | 1 | 12% |

`node src/compare.ts "A haiku (it.8)=results/A-ts-baseline@16-21" "B v1.2 haiku (it.8)=results/B-ts-query@9-14" --suite actual --model claude-haiku-5-5`

Mean cost and turns, two-sided permutation test (20,000 shuffles). Cost is shown two ways because the recorded cost undercounts output (see Measurement issue): *recorded* and *short-rate* (SDK token totals at Haiku's short-prompt rates, which are correct totals but ignore the long-prompt surcharge).

| Task | Recorded A → B | p | Short-rate A → B | Turns A → B | p (turns) | Pass A / B |
|---|---|---|---|---|---|---|
| AB1 | $0.0106 → $0.0170 (+61%) | 0.08 | $0.0173 → $0.0244 (+41%) | 29 → 41 | 0.09 | 0/6 · 1/6 |
| AB2 | $0.0199 → $0.0374 (+88%) | 0.005 | $0.0301 → $0.0509 (+69%) | 41 → 66 | 0.002 | 6/6 · 6/6 |
| AB3 | $0.0083 → $0.0221 (+167%) | 0.003 | $0.0143 → $0.0323 (+126%) | 21 → 49 | 0.002 | 6/6 · 6/6 |
| AB4 | $0.0067 → $0.0092 (+36%) | 0.016 | $0.0112 → $0.0139 (+24%) | 20 → 21 | 0.61 | 6/6 · 6/6 |

Where the input comes from (averages per run):

| | Turns | Input | Output | Tool output carried, share of input | Main tool |
|---|---|---|---|---|---|
| A | 28 | 0.72M | 14k | 29% | Bash: 23 calls, 10k output |
| B | 44 | 1.51M | 18k | 28% | query tools: 14 calls, 9k output; plus 8 Reads, 12 Bash, 9 Edits |

Cost by billing class (short-rate): A = cache write 24%, cache read 38%, output 38%; B = 22%, 48%, 30%.

**Conclusion.** On Haiku 5.5 the query layer makes the agent significantly more expensive (3 of 4 tasks at p ≤ 0.016, the fourth p = 0.08), with no gain in pass rate. Together with iteration 7 (DeepSeek: no difference), the hypothesis that a batched, symbol-level reading interface lowers cost is **rejected for this form of the tool**. Why:
- **Reading was never the bottleneck for an efficient agent.** Haiku in arm A reads only 7–18k tokens per run, mostly through compound shell commands (`cd …; grep …; sed -n …`) that already batch several lookups into one turn. Tool output is under a third of its input; the rest is the per-turn harness overhead (about 6–7k tokens per request) and the growing conversation.
- **The tools add turns.** B used 42 tool calls per run against A's 26, splitting what one shell command did into several query, Read and Edit calls. Every extra turn re-sends the context, so cost follows turns (2× on AB3).
- The DeepSeek result (no difference) fits the same picture: a model that reads inefficiently gains a little from the tools, and loses it again in turns.

What this suggests next: the lever is **turns**, not bytes read. Candidates: hand the agent a task-scoped context bundle up front (fewer orientation turns, measured as turns before the first edit); and keep per-turn overhead and context growth down. A smaller query surface (one tool, or query commands usable from the shell, so they batch like grep does) would be the version of the current idea worth a final test.

**AB1 on Haiku.** 11 of 12 runs failed only the regression rule: Haiku patches `runRules` with a special case instead of fixing the ranking comparator (seen in the job log), and the project's own tests catch it. DeepSeek fixed the comparator in 30 of 30 runs. The task separates a real fix from a symptom patch, as intended; from now on records carry the names of failed regression tests to confirm such cases.

**Measurement issue (found in this iteration).** Per-request pricing (needed for Haiku's long-prompt tier) read output tokens from the stream's start event, which only carries a placeholder; the final count arrives at the end of the stream. Recorded Claude costs in iterations 8 (and its pilot) therefore undercount output, which is 30–38% of Haiku's cost. Token totals and turns are unaffected, and the short-rate column above confirms the direction of every comparison. Fixed by observing the stream's `message_delta` events (tested against a mock). DeepSeek records were priced from SDK totals and are not affected.

---

## Iteration 9 — The query layer as a shell command (arm B2)
**Date** 2026-11-09 · **Model** `claude-haiku-5-5` · **Status** pilot

**Hypothesis.** Iteration 8 showed the MCP tools add turns: one compound shell command became several tool calls. If the same queries are a shell command (`tersa find|get|refs|outline`), the agent can batch them with other commands in one turn, keep its efficient habits, and still read more precisely. Then B2 costs no more than A, ideally less.

**Change.** New arm `B2-ts-query-shell`: a query daemon starts with the run (index, language services and session dedupe stay warm across calls, ~300 ms per call) and a `tersa` CLI is put on the agent's PATH. No MCP tools and no redirects (redirects cost turns); a short usage note in the system prompt shows a batched example. New metrics for every arm: `turnsToFirstEdit` (orientation cost) and `shellQueryCalls`; `tersa` output is attributed to files for reading precision.

**Harness fix found while building it.** A run that hits the turn limit made the SDK throw, which the runner recorded as a crash (not scored). It is now `error_max_turns`, a failed run. No past records were affected.
