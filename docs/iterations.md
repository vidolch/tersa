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
**Date** 2026-11-09 · **Model** `claude-haiku-5-5` · **Records** `results/B2-ts-query-shell/AB*/run-1` (pilot, one run per task)

**Hypothesis.** Iteration 8 showed the MCP tools add turns: one compound shell command became several tool calls. If the same queries are a shell command (`tersa find|get|refs|outline`), the agent can batch them with other commands in one turn, keep its efficient habits, and still read more precisely. Then B2 costs no more than A, ideally less.

**Change.** New arm `B2-ts-query-shell`: a query daemon starts with the run (index, language services and session dedupe stay warm across calls, ~300 ms per call) and a `tersa` CLI is put on the agent's PATH. No MCP tools and no redirects (redirects cost turns); a short usage note in the system prompt shows a batched example. New metrics for every arm: `turnsToFirstEdit` (orientation cost) and `shellQueryCalls`; `tersa` output is attributed to files for reading precision.

**Harness fix found while building it.** A run that hits the turn limit made the SDK throw, which the runner recorded as a crash (not scored). It is now `error_max_turns`, a failed run. No past records were affected.

**Pilot result.**
| Task | Group | Runs | Pass | Median cost | Median turns | Median input | Median reading | Read precision | Query calls | Redirects | Read share of carried |
|------|-------|------|------|-------------|--------------|--------------|----------------|----------------|-------------|-----------|-----------------------|
| AB1 | B2 pilot | 1 | 0/1 | $0.021 | 28 | 0.84M | 13k | 19% | 0 | 0 | 0% |
| AB2 | B2 pilot | 1 | 1/1 | $0.050 | 51 | 2.33M | 23k | 9% | 0 | 0 | 0% |
| AB3 | B2 pilot | 1 | 1/1 | $0.021 | 33 | 0.80M | 11k | 13% | 0 | 0 | 0% |
| AB4 | B2 pilot | 1 | 1/1 | $0.019 | 27 | 0.68M | 13k | 30% | 0 | 0 | 0% |

`node src/compare.ts "B2 pilot=results/B2-ts-query-shell@1" --suite actual --model claude-haiku-5-5`

Per run: `tersa` calls 4 / 1 / 2 / 0 (AB1–AB4) against 25 / 37 / 22 / 21 plain Bash calls; first edit at turn 7 / 14 / 8 / 6 of 28 / 51 / 33 / 27. The AB1 failure is the restored test `rules are deterministically ranked`, which confirms the iteration-8 reading: Haiku patches the symptom instead of fixing the ranking.

**Conclusion.** Not adopted: with the command available and described in the system prompt, Haiku still used grep/sed for almost everything. A full batch would compare A with A, so it was not run. Across three variants (MCP tools with redirects, MCP tools without, shell command without), the query layer either isn't used or adds turns. **The query-layer line is closed** in this form; its index and contract stay available for the next idea.

Useful by-product: **orientation takes 20–30% of turns** (first edit at turn 6–14), which bounds what any "find the code faster" idea can save, and sets the target for iteration 10.

---

## Iteration 10 — Task-scoped context bundle up front (arm D)
**Hypothesis.** If the agent starts with the code most likely relevant to the task already in its prompt, it skips most orientation turns (iteration 9: first edit at turn 6–14), and fewer turns means less re-sent context. The bundle must be built automatically from the spec (no ground truth), and stay small, because it is re-sent every turn.

**Change.** New arm `D-ts-bundle`: standard tools, plus a context bundle of about 6,000 tokens appended to the first prompt (counted as overhead). The bundle is built by `query/src/bundle.ts` from the spec text only, on the agent's own workspace: code terms from the spec (with naming-convention variants) and stemmed prose words matched to symbol names, scored by rarity (IDF); the top symbols as bodies, the rest as signatures. Nothing else differs from arm A.

**Offline check before spending anything** (does the bundle contain each task's core files?):

| Task | v1 (raw term matching) | v2 (IDF, naming variants, prose stems, docs down-weighted) |
|---|---|---|
| AB1 | rule-utils.ts missing | rule-utils.ts in, as a signature (#24 of 64 files) |
| AB2 | 2 of 3 core files | 2 of 3 (condition.ts missing: no term in the spec leads to it) |
| AB3 | 3 of 3 | 3 of 3 |
| AB4 | envelope.ts missing | envelope.ts in (#7) |

Core-file recall 4/8 → 7/8. All changes are generic rules; none was tuned to a task's ground truth. The bundle still carries noise (UI and importer files), which the agent pays for on every turn as cached input.

**Run.** A runs 22–27 (same period, corrected Claude pricing) and D runs 1–6 on `claude-haiku-5-5`, started together.

**Expected if the hypothesis holds.** Fewer turns before the first edit (A on Haiku: about 6–14) and fewer turns overall, at equal pass rate, outweighing the bundle's per-turn cost.

**Result** (`node src/compare.ts "A haiku (it.10)=results/A-ts-baseline@22-27" "D bundle (it.10)=results/D-ts-bundle@1-6" --suite actual --model claude-haiku-5-5`; means with a two-sided permutation test, 20k shuffles):

| Task | Pass A / D | Cost A → D | p | Turns A → D | p |
|---|---|---|---|---|---|
| AB1 | 0/6 / 0/6 | $0.0184 → $0.0201 (+9%) | 0.66 | 30 → 27 | 0.52 |
| AB2 | 6/6 / 6/6 | $0.0313 → $0.0321 (+3%) | 0.88 | 38 → 36 | 0.80 |
| AB3 | 6/6 / 6/6 | $0.0171 → $0.0166 (−3%) | 0.67 | 27 → 22 | 0.10 |
| AB4 | 6/6 / 6/6 | $0.0114 → $0.0158 (+38%) | 0.51 | 20 → 20 | 1.00 |

Turn of the first edit, per run (`-` = not measured, see the correction below):

| Task | A runs 22–27 | D runs 1–6 |
|---|---|---|
| AB1 | 7, 8, 16, -, -, 12 | -, -, 6, -, -, - |
| AB2 | -, 10, -, -, -, - | -, -, -, -, 10, - |
| AB3 | -, 11, 9, -, 9, 8 (mean 9.3) | -, 5, 5, 6, 5, 6 (mean 5.4) |
| AB4 | 4, 7, 5, 6, 3, 5 (mean 5.0) | 3, 4, 4, 3, 3, 4 (mean 3.5) |

**Correction (found while preparing iteration 11).** `turnsToFirstEdit` only counted the Edit/Write tools, but Haiku edits with `sed -i` and heredocs in 20 of 48 runs, which were recorded as "no edit". A first version of this table filled those with the run's total turns and showed AB1 as "first edit later with the bundle"; that was an artifact and is withdrawn. The metric now also counts shell writes to source files (`SHELL_EDIT` in `metrics.ts`, with tests). The AB3 and AB4 values above were measured correctly.

Totals: A $0.0261 per pass, D $0.0282 per pass (+8%); 18/24 passing in both. No crashes, retries or network commands. The AB4 mean is driven by one D run (43 turns, $0.038); medians are $0.010 vs $0.011. Every AB1 failure in both arms is the same regression test (`rules are deterministically ranked`): the agent still patches the symptom.

**Conclusion.** The hypothesis holds only partly. The bundle moves the first edit earlier where it contains the right code (AB3 9.3 → 5.4, AB4 5.0 → 3.5, every D run at or below the A minimum), and total turns drop slightly on three tasks. But the saving is about the size of the bundle's own cost (about 6k tokens re-sent on every turn as cached input), so cost per pass doesn't move. Not significant on any task; arm D is not a win at this bundle size.

What it suggests: orientation turns are real and can be shortened, but only by giving the agent less, more precise context (a smaller bundle with higher recall at the top). The cost of a front-loaded bundle is paid every turn, so its break-even is roughly "saves more turns than its size divided by the average per-turn context".

Records: `results/A-ts-baseline/AB*/run-22..27.json`, `results/D-ts-bundle/AB*/run-1..6.json`.

## Iteration 11 — Where Haiku's money goes (analysis only, no runs)

**Question.** Before building "trim old tool output from the context" (the next idea after iteration 10), how much could it save at most?

**Method.** From the 48 records of iteration 10, split cost by token class with `harness/prices.json`; `toolCost.carriedTokens` gives how much of the cached input is old tool output; the rest, divided by turns, is the context present on every turn regardless of tool output (system prompt, tool definitions, the agent's own messages, plus the bundle in arm D).

| Arm | Cache reads | of which old tool output | Cache writes | Output | Non-tool context per turn |
|---|---|---|---|---|---|
| A (Haiku, runs 22–27) | 38% | 12% | 23% | 38% | 16.9k tokens |
| D (Haiku, runs 1–6) | 44% | 9% | 21% | 35% | 26.0k tokens |

**Conclusion.** Old tool output is about 12% of cost on Haiku. Trimming it can save at most that, minus the cache rewrites it causes (changing an earlier message invalidates the cached prefix after it). Not worth an iteration. The bigger shares are the agent's output (38%) and the fixed context re-sent on every turn (about 26%). That confirms D's problem in numbers: the bundle adds ~9k tokens to every turn. With costs this split, the remaining levers are fewer turns (scales every class except output) and less output per turn.

**Follow-up: token anatomy from the transcripts** (`results/analysis/it10-haiku.md`, made by `harness/runner/src/anatomy.ts` via the `anatomy` workflow, because transcripts are only kept as Actions artifacts). Per request: start context from the first request, output shared out by content-block characters, carried input split into start context, the agent's own earlier output, and the rest (tool results).

| Arm | Start context | Output per run | Output share of cost* | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|---|---|
| A | 6.2k | 15.0k | 49% | 11% | 13% | 27% |
| D | 16.0k | 14.8k | 44% | 23% | 12% | 21% |

\*Cache writes not split; carried input at the cache-read price.

The decisive line is in the file's header: **about 417 thinking blocks per arm, all with empty text, and 0.74 output tokens per visible character** (visible code and prose run at roughly 0.25–0.3). Haiku 5.5 thinks adaptively by default and the SDK doesn't return the thinking text, so the output split above is wrong in one way: roughly 60% of output tokens are hidden thinking, which makes thinking alone about 30% of the bill. The start context (system prompt + tool definitions + task prompt) is only 6.2k in arm A: the SDK already uses its minimal system prompt, so a "lean harness" arm has little to remove.

## Iteration 12 — Thinking and effort (arm A, model settings only)

**Hypothesis.** Hidden thinking is ~60% of Haiku's output tokens and ~30% of cost (iteration 11 follow-up). Lowering effort, or turning thinking off, cuts that directly; the question is whether pass rate holds. This is not about Tersa itself, but it sets the cost floor every other arm is measured against, and shows how much of "cost per passing task" is reasoning rather than reading or writing.

**Change.** New runner option `--model-options` (`effort=low|medium|high|xhigh|max`, `thinking=adaptive|disabled`), recorded as `modelOptions` in the run record and shown in the summary next to the model. The bench forms get a `model_options` input (it replaces `max_minutes`, which keeps its 30-minute default, because forms allow 10 inputs). Nothing else changes.

**Run.** Three same-period arm A batches on `claude-haiku-5-5`, 6 runs per task: SDK defaults (runs 28–33), `effort=low` (runs 34–39), `thinking=disabled` (runs 40–45).

**Expected if the hypothesis holds.** Output tokens per run down by about half with `thinking=disabled`, cost per pass down 20–30%, the same 18/24 passes (AB1 already fails in every run). If passes drop, the saving is not real.

**Result** (`node src/compare.ts "default=results/A-ts-baseline@28-33" "effort low=results/A-ts-baseline@34-39" "thinking off=results/A-ts-baseline@40-45" --suite actual --model claude-haiku-5-5`; per-task means, two-sided permutation test against the default batch):

| Setting | Pass | Cost per pass | Turns per run | Output per run | Wall time per run |
|---|---|---|---|---|---|
| SDK defaults (runs 28–33) | 19/24 | $0.0235 | 27.1 | 14.1k | 3.5 min |
| `effort=low` (runs 34–39) | 16/24 | **$0.0116 (−51%)** | 13.8 | 6.6k | 1.3 min |
| `thinking=disabled` (runs 40–45) | 18/24 | $0.0277 (+18%) | 29.5 | 15.2k | 3.6 min |

| Task | Cost default → `effort=low` | p | → `thinking=disabled` | p | Pass default / low / off |
|---|---|---|---|---|---|
| AB1 | $0.0167 → $0.0094 | 0.016 | $0.0193 | 0.35 | 1 / 0 / 0 |
| AB2 | $0.0297 → $0.0108 | 0.002 | $0.0378 | 0.20 | 6 / 4 / 6 |
| AB3 | $0.0168 → $0.0077 | 0.002 | $0.0152 | 0.30 | 6 / 6 / 6 |
| AB4 | $0.0112 → $0.0030 | 0.002 | $0.0109 | 0.89 | 6 / 6 / 6 |

Anatomy (`results/analysis/it12-haiku.json`, split by run number):

| Setting | Requests per run | Output per request | Thinking blocks per run |
|---|---|---|---|
| defaults | 26.8 | 524 | 17.1 |
| `effort=low` | 12.8 | 513 | 7.1 |
| `thinking=disabled` | 26.5 | 575 | 17.4 |

**Conclusion.**
- **`effort=low` halves cost per passing task**, significant on every task (p ≤ 0.016), and runs 2.7× faster. It does so entirely by halving turns: output per request is unchanged (~520 tokens). Turns are the lever again, as in iterations 7–10.
- **But it loses correctness:** AB2 drops to 4/6, and both failures are R5, the filter path (`make-filters-from-conditions`). *(Corrected in iteration 13: the original text said the agent never found the second place. It always does; it implements it with `$like`, which is silently unanchored in Actual.)* AB1 stays at the symptom-patch failure (0–1/6 in every setting).
- **`thinking=disabled` had no effect.** The transcripts still hold ~17 thinking blocks per run, the same as the defaults; the setting doesn't reach the model in this SDK/model combination. That batch is effectively a second default batch, and its +18% (p 0.2–0.9) is a useful check on run-to-run noise. The "hidden thinking is ~60% of output" estimate from iteration 11 is unconfirmed: output tokens per visible character are 0.70–0.78 in all three settings, so the gap may be tool-call encoding rather than thinking.

**What this means for Tersa.** This is the first result that points at the language rather than at tooling. A cheap, low-effort agent is half the price, and its failure is a *missed second place that had to change*. That is the kind of failure a language can prevent: if adding an operator to a closed set made every place that handles operators fail to compile until handled (exhaustive matching, no silent `default`), a low-effort agent would be told by the compiler where R5 is. Next: check how Actual's condition and filter code dispatch on operators, and whether a compile-time exhaustiveness check in plain TS would have flagged R5 (cheap to test as an arm before building any language).

Records: `results/A-ts-baseline/AB*/run-28..45.json`.

## Iteration 13 — One language rule, applied by hand (arm F)

**Hypothesis.** At `effort=low`, Haiku costs half as much, but on AB2 it misses the second place that must handle the new operator (R5, `conditionsToAQL`) in 2 of 6 runs (iteration 12). If the code made that place a compile error, a cheap agent that runs the typechecker would find it. This is a property a language can enforce everywhere (closed sets, exhaustive matching, no silent `default`), so it's the first test of a Tersa rule. It is tested in plain TypeScript, without building the language.

**How Actual dispatches on operators** (at the pinned commit):
- The operator union `RuleConditionOp` exists in `types/models/rule.ts`, but the two dispatchers don't use it. `Condition.op` is untyped, both files are `@ts-strict-ignore`, and the switches end in `default: return false` (`Condition.eval`, rule matching) and `default: throw` (`conditionsToAQL`, filters). Adding an operator to the union breaks nothing there.
- The op lists that say which operators a field type allows (`CONDITION_TYPES` in `condition.ts`, `TYPE_INFO` in `shared/rules.ts`) are untyped string arrays.
- One place is already exhaustive: `OP_SCORES: Record<RuleConditionOp, number>` in `rule-utils.ts`. Adding `startsWith` to the union breaks the build there only.

**Change: arm F** = arm A plus a code patch applied to the start state before the agent starts (`arms/F-ts-exhaustive/patches/AB2.patch`, 4 files, behaviour-preserving):
- `Condition.op` is typed as `AnyConditionOp` (the union plus the internal `and`/`true`/`false`). Both switches end in `assertNever(op)` (new `shared/assert-never.ts`); the internal operators that used to fall through to `return false` are now listed explicitly.
- Both op lists are checked against the union (`[...] satisfies RuleConditionOp[]`).
- Effect, checked by hand: adding `startsWith` to either op list fails the build until it is added to the union; adding it to the union fails the build at `Condition.eval`, `conditionsToAQL` and `OP_SCORES`. Before the patch, only `OP_SCORES` failed.
- Checks: typecheck passes; loot-core regression tests pass (29 files, 624 tests); `ARM=F-ts-exhaustive harness/validate-actual.sh AB2` passes (start fails R1–R5, the reference rebased onto the patch passes everything).

Harness changes: arms can declare `codePatches` per task (applied by `prepare.sh` through `ARM_PATCH`); `validate-actual.sh` takes `ARM=`. The suite profile now lists the typecheck command (`yarn workspace @actual-app/core run typecheck`) for **all** arms. Earlier arm A runs didn't have this line, so arm A is rerun in the same period.

**Run.** AB2 only, `claude-haiku-5-5`, `effort=low`, 12 runs per arm in the same period: A runs 46–57, F runs 1–12.

**Expected if the hypothesis holds.** F misses R5 less often than A, at similar cost. If F's agents don't run the typechecker, or don't add `startsWith` to the union, the rule doesn't help an agent that doesn't consult the compiler. That would be a finding too: the language would have to run the check itself.

**Result** (`node src/compare.ts "A low (it.13)=results/A-ts-baseline@46-57" "F low (it.13)=results/F-ts-exhaustive@1-12" --suite actual --model claude-haiku-5-5`):

| Arm | Pass | Cost per pass | Mean cost per run | Turns per run | Failures |
|---|---|---|---|---|---|
| A, `effort=low` (runs 46–57) | 4/12 | $0.0325 | $0.0108 | 16.5 | R5 × 8 |
| F, `effort=low` (runs 1–12) | 6/12 | $0.0234 | $0.0117 | 18.8 | R5 × 6 |

Passes: Fisher exact p = 0.68. Cost per run: p = 0.60. Turns: p = 0.45. No difference.

**What the agents actually did** (new `harness/runner/src/probe.ts`, run through the `anatomy` workflow on the uploaded transcripts and final workspaces: `results/analysis/it13-ab2.probe.md`, `it13-ab2-code.probe.json`):
- **Every one of the 24 runs**, in both arms, added `startsWith` to the operator union, to `Condition.eval` and to `conditionsToAQL`, and ran the typechecker (first time at turn 6–26). None ended with type errors.
- The outcome is decided entirely by **how** the filter case is written:

| Filter implementation | A | F | Result |
|---|---|---|---|
| `apply(field, '$like', value + '%')` | 8 | 6 | always fails R5 |
| anchored `$regexp` (`'^' + escaped value`) | 4 | 6 | always passes |

- Why `$like` fails: Actual's `$like` runs through `unicodeLike` (`platform/server/sqlite/unicodeLike.ts`), which turns the LIKE pattern into a JavaScript regex **without anchors**. `rent%` becomes `/rent.*/i`, which also matches "Not rent". In SQL, `LIKE 'rent%'` is a prefix match; here it isn't. The agents wrote the textbook-correct code against an API whose name promises SQL semantics it doesn't deliver.

**Correction to iteration 12.** Its conclusion said the low-effort agent "implements the operator where it first finds it and stops; nothing in the code tells it there's a second place". That was a guess from the failing rule's name and it is wrong. The second place is always found; the failure is semantic (the `$like` trap). The README finding is corrected. What effort buys here is apparently *checking*: at default effort AB2 passes 6/6 in iterations 10 and 12, so higher-effort runs presumably catch the trap, by reading `unicodeLike` or testing a negative case. Confirming that needs a probe of the default-effort transcripts.

**Conclusion.** Hypothesis rejected for this task, for a clear reason: there was no missed place for the compiler to point at. Exhaustive dispatch is cheap and harmless (F costs the same), but this failure is a **lying primitive**, not an omission. For Tersa that suggests two rules worth more than exhaustiveness here:
1. **No lying names in the standard vocabulary.** A primitive called `like` must behave like LIKE, or carry its real semantics in its type or signature (e.g. `matchesAnywhere(pattern)`). Tooling can't fix a name that misleads.
2. **One definition of an operator's meaning.** `startsWith` is implemented twice, once in memory (`Condition.eval`, R2: passed in every run) and once as a query (`conditionsToAQL`, R5: the trap). If the language derived both from one definition, the trap would have nowhere to live. The weaker, testable version is a contract check that the two paths agree on the spec's own examples.

Records: `results/A-ts-baseline/AB2/run-46..57.json`, `results/F-ts-exhaustive/AB2/run-1..12.json`.

**Follow-up: what effort buys** (`results/analysis/it12-ab2-code.probe.json`, iteration 12's AB2 runs). At default effort, all 6 runs write the filter as an anchored `$regexp`; two leave a comment saying why, e.g. run 32: "`$like` can't be used here because its matching is not anchored." At `effort=low` 2 of 6 use `$like` and fail. Across all low-effort AB2 runs (iterations 12 and 13, both arms) 16 of 30 use `$like`, against 0 of 6 at default effort (Fisher p = 0.02). So effort buys **checking the semantics of the primitive being used**, not finding the places to change. Cheap agents trust names; that is the cost a misleading name imposes.

## Iteration 14 — "One definition per operator", approximated by a test (arm G)

**Hypothesis.** Low-effort AB2 failures are the `$like` trap: the filter version of `startsWith` disagrees with the rule-matching version (iteration 13). The language rule that removes the trap is "one definition of an operator's meaning, from which both evaluators are derived". Without building that, the closest stand-in is a check in the codebase that the two evaluators agree for every operator. If a cheap agent runs the existing tests, the check tells it its filter is wrong, and it fixes it.

**Change: arm G** = arm A plus one new test file in the start state (`arms/G-ts-agreement/patches/AB2.patch` → `packages/loot-core/src/server/transactions/condition-agreement.test.ts`). It loops over every operator in `CONDITION_TYPES.string.ops`, so an operator the agent adds is checked automatically. For each operator and several values it builds a `Condition` on `notes`, and compares the transactions `Condition.eval` accepts with those the `conditionsToAQL` query returns, over 12 notes chosen to expose case and anchoring differences ("Rent October", "Not rent", "renting", "Straße", empty, null…). No production code changes; nothing tells the agent the test exists.

Checks: at the start state 31/31 cases pass. With the `$like` implementation from the failing iteration-13 runs, 4 `startsWith` cases fail ("Not rent" is returned by the filter but not by the matcher). With the reference solution, 36/36 pass. `ARM=G-ts-agreement harness/validate-actual.sh AB2` passes.

**Side finding.** The first version of the test also used values with LIKE wildcards and immediately found an existing disagreement in Actual at the pinned commit: `contains "a%"` treats `%` as a wildcard in filters but literally in rule matching (same for `doesNotContain`). Those values were removed so the test passes at the start; the bug is outside the task. It's the same class of defect as the trap: two implementations of one operator, silently different.

**Run.** AB2 only, `claude-haiku-5-5`, `effort=low`, 12 runs per arm, same period: A runs 58–69, G runs 1–12.

**Expected if the hypothesis holds.** G passes R5 clearly more often than A (A: 4/12 and 2/6 in earlier low-effort batches), at similar or slightly higher cost (an extra test run and a fix). The probe will show whether G's agents ran the agreement test at all; if they mostly didn't, the check only helps when the harness or the language runs it, not when it merely exists.

**Result** (`node src/compare.ts "A low (it.14)=results/A-ts-baseline@58-69" "G low (it.14)=results/G-ts-agreement@1-12" --suite actual --model claude-haiku-5-5`):

| Arm, `effort=low` | Pass | Cost per pass | Mean cost per run | Turns per run |
|---|---|---|---|---|
| A (runs 58–69) | 6/12 | $0.0231 | $0.0115 | 18.4 |
| G (runs 1–12) | **11/12** | **$0.0144 (−38%)** | $0.0132 (+15%, p = 0.34) | 22.1 (p = 0.22) |

Passes, same period: Fisher p = 0.069. Pooled with the earlier low-effort arm A batches on AB2 (iterations 12–14, 14/30), G's 11/12 gives p ≈ 0.006, with the caveat that the pooled batches aren't all from the same period. For reference, default effort without the test: 6/6 at $0.030 per pass (iteration 12), so **G at low effort is about half the cost of default effort at nearly the same pass rate.**

Same mechanism as iteration 13: every A failure uses `$like`, every pass an anchored regexp. In G, 11 runs use a regexp and 1 uses `$like` (run 8, the only failure). The agreement test file was left unchanged in all 12 G runs.

How the test acted (`results/analysis/it14-ab2-G.probe.json`, new `--output` option of `probe.ts`: tool results that mention the test, and those showing it failing):

| G runs | What happened | Outcome |
|---|---|---|
| 1, 4, 9, 12 | ran the test, saw `startsWith` cases fail (turns 12–16), fixed the filter | pass |
| 2, 3, 6, 10 | saw the test file in output (listing or a test run), never saw it fail | pass |
| 5, 7, 11 | never saw it in tool output (may have read it with Read, which this probe can't tell) | pass |
| 8 | never saw it, used `$like` | **fail** |

**Conclusion.** Hypothesis supported, with a clear mechanism. A check that the two evaluators of an operator agree turned the `$like` trap from a silent failure into a test failure, and at least 4 of 12 low-effort runs were rescued by it directly. The one failure is a run that never ran it. The cheap setting then keeps most of its saving: −38% cost per pass against low-effort A, about −50% against default effort.

**For Tersa:**
- The language rule behind this (one definition per operator, with every evaluator derived from it, or at least checked against it) is the first rule in this project with a measured effect on cost per passing task.
- The remaining failure is an agent that didn't run the check. In the language, the check wouldn't be optional: either it holds by construction (one definition), or the toolchain runs it as part of the build, the way the typechecker runs. The next harness-level test of that is to run the agreement check automatically after edits instead of leaving it in the test suite.
- Iterations 13 and 14 together: guaranteeing that every place is *touched* (exhaustiveness) didn't help, because the agents already found every place. Guaranteeing that the places *agree* did help. Agents' weak point here is semantics, not navigation.

Records: `results/A-ts-baseline/AB2/run-58..69.json`, `results/G-ts-agreement/AB2/run-1..12.json`.

## Iteration 15 — Does the rule generalise? (pre-registered)

**Why not "run the check automatically" first.** G is already at 11/12 on AB2; an automatic check could add one pass at most, which 12 runs can't detect. The more important question is whether iteration 14 generalises, because the AB2 check was written knowing exactly how agents fail there.

**Protocol (fixed before any agent runs on the new task):**
1. A **generic** agreement check, `arms/G-ts-agreement/condition-agreement.generic.test.ts`, committed now and not changed afterwards. It covers every operator in `CONDITION_TYPES` for every condition type with a database-backed field (string: `notes`, `imported_payee`; number: `amount`; date: `date`; boolean: `cleared`), on 9 transactions and fixed sample values per type, comparing `Condition.eval` with the `conditionsToAQL` query. An operator for which no sample value is valid fails with "add one to SAMPLE_VALUES", so a new operator can't pass unchecked. Checked: 23/23 pass at the start state; the AB2 reference passes (24/24); the iteration-13 `$like` variant fails (`string startsWith`). Excluded, as in iteration 14: LIKE wildcards in string values (existing `contains` disagreement).
2. A **new task AB5**, written after this commit, that adds behaviour to a condition operator on a different type from AB2, with hidden acceptance tests and a reference solution validated the usual way. Its acceptance tests are written from the spec, not from agent behaviour.
3. Runs: AB5, `claude-haiku-5-5`, `effort=low`, arm A vs arm G (G's AB5 patch adds exactly this generic file), 12 runs each, same period. Default-effort arm A, 6 runs, as a reference point.
4. Reported whatever the outcome; success = G passes clearly more often than A at low effort, or the check visibly catches a disagreement in G runs (probe). If A already passes AB5 at low effort, the task has no semantic trap and the result is "no effect possible", reported as such.

**Task AB5, written after the check was frozen** (`suites/actual/tasks/AB5/`): allow `isbetween` on the transaction `date` field with a `{ from, to }` value, inclusive, ends in either order, rejected for non-exact dates, and working in both rule matching (R2, R3) and filters (R5); amount `isbetween` must keep working. Hidden acceptance tests through `@actual-app/api` (`acceptance/tests/AB5.test.ts`); reference solution in 4 files. `harness/validate-actual.sh AB5` passes for arms A and G (start fails R1–R5, reference passes all).

The frozen check, applied unchanged to AB5 (`arms/G-ts-agreement/patches/AB5.patch`): with the reference solution it fails only with "no sample value is valid for "isbetween" on date fields: add one to SAMPLE_VALUES.date", which is the designed behaviour for a new operator; once a `{ from, to }` sample is added it passes (24/24). Whether it catches anything in agents' code depends on what they get wrong, which isn't known yet.

**Runs dispatched:** AB5, `claude-haiku-5-5`: arm A `effort=low` runs 1–12, arm G `effort=low` runs 1–12, arm A default effort runs 13–18.

**Result** (AB5, `claude-haiku-5-5`, same period):

| Arm | Pass | Cost per pass | Turns per run |
|---|---|---|---|
| A, `effort=low` (runs 1–12) | 12/12 | $0.0105 | 17.0 |
| G, `effort=low` (runs 1–12) | 12/12 | $0.0120 (+14%, p = 0.06) | 18.8 |
| A, default effort (runs 13–18) | 6/6 | $0.0273 | 36.7 |

Probe (`results/analysis/it15-ab5.probe.json`): 10 of 12 G runs ran the check, got "no sample value is valid for "isbetween" on date fields", added a `{ from, to }` sample to the test and re-ran it; 2 runs never ran it. All 36 runs pass every rule, including the ends in either order in filters (R3/R5).

**Conclusion (as pre-registered: "no effect possible").** AB5 has no semantic trap: the existing amount `isbetween` already shows the right pattern in both evaluators (sorted ends, `$gte`/`$lte`), and every agent copied it. With nothing to catch, the check can only cost, and it does: about +14% per pass, almost all of it the turns spent adding a sample value the check demands. So the generalisation question is **not answered** by this task. What it does show:
- The check is honest about its price. Its benefit on AB2 (−38% cost per pass) and its tax on AB5 (+14%) are both measured; whether it pays depends on how often tasks hit a disagreement between two implementations.
- The tax comes from maintaining the check by hand (sample values). In a language where both evaluators are derived from one definition there's nothing to maintain and nothing to disagree, which is the stronger form of the rule; this result argues for that form over a test.
- `effort=low` passes AB5 12/12 at 38% of default effort's cost per pass. Where the code shows the pattern to copy, the cheap setting is enough; AB2 failed only because the pattern on offer (`$like`) was misleading.

**Limit of the method.** Writing a task with a trap in it after seeing the check would bias the test, and writing one without knowing whether it has a trap (as here) can come out empty. A fairer source of traps is disagreements that already exist upstream: the generic check found one at the pinned commit (`contains` with `%`/`_`, iteration 14). A task that touches that code would be a trap nobody designed.

Records: `results/A-ts-baseline/AB5/run-1..18.json`, `results/G-ts-agreement/AB5/run-1..12.json`.

## Iteration 16 — Why AB1 always fails, and stated contracts (arm H)

**AB1 failure analysis (no new runs).** AB1 has failed in nearly every run of every arm and setting (0–1/6). The probe on iteration 12's AB1 runs (`results/analysis/ab1-fixes*.probe.json`) shows what agents do. They find the seeded comparator flip in `_rankRules` (most specific first), but **decide it is intended**: "most specific first" reads like a sensible display order. Then they add a separate execution order, an `ascending`/`descending` flag or a reversed copy at the `runRules` call site, with comments like "Order in which rules must be *executed*… the most specific rule has to run last". The API-visible symptom is fixed (R1–R4 pass), but `rankRules` still returns the wrong order to its other callers (the API's `getRules`, the rules list), which the restored upstream test (`rules are deterministically ranked`) catches. Only run 32 of 12 fixed the comparator itself.

The cause is the **missing contract**: nothing in the code says which direction `rankRules` returns. Its only comment says the order must be deterministic. The one place that stated the direction was the upstream test that the task removes. So agents have to infer intent, and the seeded bug looks like intent.

**Hypothesis.** If functions carry their contract (a Tersa rule: every function states what it returns, as part of its signature), the agent can see that the implementation violates the contract and fixes the implementation rather than working around it.

**Change: arm H** = arm A plus contract comments on **every** function in `rule-utils.ts` (9 functions: `assert`, `computeScore`, `_rankRules`, `rankRules`, `migrateIds`, `iterateIds`, `parseRecurDate`, `parseDateString`, `parseBetweenAmount`), each a short "Contract:" doc comment describing upstream behaviour (`arms/H-ts-contracts/patches/AB1.patch`, comments only). All functions, not just the one with the bug, so the treatment is "the module documents its contracts", not a pointed hint. Still, the honest framing is that this measures **the value of a stated contract when the implementation contradicts it**, not whether agents can infer unstated intent. `ARM=H-ts-contracts harness/validate-actual.sh AB1` passes.

**Run.** AB1, `claude-haiku-5-5`, `effort=low`, 12 runs per arm, same period: A runs 70–81, H runs 1–12.

**Result** (`node src/compare.ts "A low (it.16)=results/A-ts-baseline@70-81" "H low (it.16)=results/H-ts-contracts@1-12" --suite actual --model claude-haiku-5-5`):

| Arm, `effort=low` | Pass | Cost per pass | Mean cost per run | Turns | Output per run |
|---|---|---|---|---|---|
| A (runs 70–81) | 1/12 | $0.1189 | $0.0099 | 19.8 | 8.8k |
| H (runs 1–12) | **12/12** | **$0.0030** | $0.0030 (p < 0.001) | 8.3 | 2.2k |

Passes: Fisher exact p ≈ 1e-5. All 11 A failures are the same regression test; probe (`results/analysis/it16-ab1.probe.json`): 11 of 12 H runs restore the comparator exactly as upstream wrote it (the 12th fixes it with an equivalent expression), against 1 of 12 in A. H runs are also shorter: 8 turns instead of 20, a quarter of the output, because there's nothing to deliberate about once the contract and the code disagree.

**Conclusion.** The largest effect in this project so far: **cost per passing task 40× lower**, from the worst task to a perfect score, at the cheapest setting. The failure on AB1 was never about finding code or reading too much. Agents found the bug every time and argued themselves out of it, because nothing said what the function was supposed to do. A one-line contract per function turns "is this intended?" into "the code contradicts its contract".

**Caveats.**
- I wrote the contracts knowing where the bug is. All 9 functions got one, and each states upstream behaviour, but the `_rankRules`/`rankRules` contracts state exactly the property the bug violates. The scenario is realistic (a regression against a documented contract is how bugs usually look in documented code), but it doesn't show that contracts written *without* knowing the bug help as much.
- One task, one model, 12 runs per arm.

**For Tersa:** "every function states its contract" moves from a stylistic idea to the rule with the strongest measured effect. The next test removes the bias above: contracts generated mechanically from the correct code, before the regression, for every function in the modules the task touches, without anyone choosing what they say.

Records: `results/A-ts-baseline/AB1/run-70..81.json`, `results/H-ts-contracts/AB1/run-1..12.json`.

## Iteration 17 — Contracts written by a model, blind to the bug (arm I)

**Hypothesis.** Iteration 16's contracts were written by me, knowing the bug. If contracts generated mechanically from the correct code, by a model that knows nothing about the task, give a similar effect, then the rule "every function states its contract" doesn't depend on someone knowing where bugs will be.

**Change: arm I** = arm A plus contract comments generated by `query/src/contracts.ts` (new) through the new `contracts` workflow:
- Input: the pristine (correct, pre-regression) versions of AB1's relevant files: `rule-utils.ts`, `rule.ts`, `transaction-rules.ts` (`rules/index.ts` has no functions). The TypeScript AST finds every top-level function, arrow-function constant and class method (53).
- One request per file to `claude-haiku-5-5` (default settings) with the whole file and the list of function ids, and a fixed prompt: "write its contract in one or two sentences: what it takes, what it returns or changes, and any ordering, range or invariant the code guarantees. Describe precisely what the code does… No speculation." Nothing about any task.
- The replies are inserted unedited as `/** Contract: … */` above each function (`arms/I-ts-gencontracts/patches/AB1.patch`; raw replies in `AB1.contracts.json`). The patch is applied after AB1's start patch, so the comment for `_rankRules` describes upstream behaviour and the code below it contradicts it, as in a real regression.
- Differences from H, by construction: three files instead of one, 53 contracts instead of 9, and they describe *what* the code does, not why. `_rankRules`: "returns a new array sorted by computed score ascending, with ties broken by ascending string comparison of rule ids…". `rankRules` only says it ranks each stage with `_rankRules`; nothing says that later rules overwrite earlier ones.
- `ARM=I-ts-gencontracts harness/validate-actual.sh AB1` passes.

**Run.** AB1, `claude-haiku-5-5`, `effort=low`, 12 runs per arm, same period: A runs 82–93, I runs 1–12.

**Result** (`node src/compare.ts "A low (it.17)=results/A-ts-baseline@82-93" "I low (it.17)=results/I-ts-gencontracts@1-12" --suite actual --model claude-haiku-5-5`):

| Arm, `effort=low` | Pass | Cost per pass | Mean cost per run | Turns |
|---|---|---|---|---|
| A (runs 82–93) | 1/12 | $0.1076 | $0.0090 | 18.2 |
| I (runs 1–12) | **10/12** | **$0.0056** | $0.0047 (p < 0.001) | 10.8 |
| *H, iteration 16 (hand-written contracts)* | *12/12* | *$0.0030* | *$0.0030* | *8.3* |

Passes: Fisher p = 0.0006. Probe (`results/analysis/it17-ab1.probe.json`): all 10 I passes restore the upstream comparator; both I failures leave it flipped and work around it, as A runs do. In A, 3 runs restored the comparator but still failed the regression test (they also changed the order somewhere else); 8 kept the workaround.

**Conclusion.** The effect holds without anyone knowing the bug: contracts written mechanically by a model from the correct code take AB1 from 1/12 to 10/12 and cut cost per pass 19×. They are somewhat weaker than hand-written ones (10/12 vs 12/12, $0.0056 vs $0.0030; different periods, so only indicative), which fits how they differ: they state *what* (`sorted by computed score ascending`) but not *why* (later rules overwrite earlier ones), and they are spread over 53 functions in 3 files instead of 9 in one. Both still give the agent what it lacked: a statement of intent that the code can be checked against.

**For Tersa.** Two of the three rules tested have a measured effect, and this one is cheap to apply to existing code: generating contracts cost a few cents and needed no knowledge of where bugs are. In the language, the contract is part of the function's signature and written when the function is written; the toolchain can then also check that it still describes the code. That keeps contracts current when code changes, and it stops a contract from being "fixed" to match a bug. In TypeScript today, the measured effect is available as plain comments.

Records: `results/A-ts-baseline/AB1/run-82..93.json`, `results/I-ts-gencontracts/AB1/run-1..12.json`; contracts: `arms/I-ts-gencontracts/patches/AB1.contracts.json`.

## Iteration 18 — Generated contracts on every task (arm I, AB1–AB5)

**Question.** Iteration 17 showed blind, model-written contracts fixing AB1. Do they help, or cost, on the other tasks? There, nothing contradicts a contract, so the contracts are just more text to read. On AB2 they might help: the generated contract for `unicodeLike` says the LIKE pattern is translated "with no anchors" and "matches anywhere within `value`", which is exactly the trap of iterations 12–14.

**Change.** Contracts generated the same way for every task's relevant `.ts` files (`contracts` workflow, one run per task; now in batches of 20 functions per request, after two first attempts failed on large files): AB2 57 contracts in 6 files, AB3 170 in 6, AB4 33 in 3, AB5 55 in 5 (AB1: 53 in 3, iteration 17). Where a task's reference solution doesn't apply on top of the comments (a new function inserted next to a commented one), `harness/rebase-reference.sh` (new) rebases it for validation; `ARM=I-ts-gencontracts harness/validate-actual.sh` passes for all five tasks.

**Run.** All five tasks, `claude-haiku-5-5`, `effort=low`, 6 runs per task per arm, same period: A runs 100–105, I runs 13–18 (one run range for all tasks; AB1 runs 1–12 are iteration 17).

**Result** (`node src/compare.ts "A low=results/A-ts-baseline@100-105" "I low=results/I-ts-gencontracts@13-18" --suite actual --model claude-haiku-5-5`; mean cost per run, permutation test):

| Task | Pass A / I | Cost per pass A → I | Mean cost per run, p | Turns A → I |
|---|---|---|---|---|
| AB1 | 0/6 / **4/6** | – → $0.0093 | $0.0092 → $0.0062, p = 0.08 | 19.8 → 13.5 |
| AB2 | 4/6 / 2/6 | $0.0173 → $0.0313 | $0.0115 → $0.0104, p = 0.43 | 19.0 → 22.0 |
| AB3 | 6/6 / 6/6 | $0.0056 → $0.0078 (+39%) | p = 0.12 | 10.3 → 13.3 |
| AB4 | 6/6 / 6/6 | $0.0027 → $0.0041 (+52%) | p = 0.002 | 6.3 → 8.0 |
| AB5 | 6/6 / 5/6 | $0.0108 → $0.0150 | $0.0108 → $0.0125, p = 0.78 | 16.0 → 19.5 |
| **All** | **22/30 / 23/30** | **$0.0109 → $0.0107** | | |

Probe and anatomy (`results/analysis/it18.*`):
- **AB2: the contract that describes the trap is never read.** It sits on `unicodeLike` in `platform/server/sqlite/unicodeLike.ts`; agents write `$like` in `transaction-rules.ts` and don't open the implementation behind it. Only 1 of 6 I runs had that contract in a tool result, and that run passed; all 4 I failures are `$like`, as in A. AB2's 2/6 vs 4/6 is within noise (Fisher p ≈ 0.57).
- **AB3, AB4: a reading tax.** Old tool output carried in context goes from 50k to 92k tokens (AB3) and 20k to 48k (AB4): the files are longer (AB3's files got 170 contracts), and every Read pays for it, on every later turn.
- AB5's one failure sorts the date ends with `sortNumbers` (a numeric helper) in the filter path. A one-off, not a pattern.

**Conclusion.** Across all five tasks, generated contracts are a wash: one more pass (23 vs 22 of 30) at the same cost per pass. That average hides three distinct effects:
1. **A large win where the code being edited contradicts its contract** (AB1: 0/6 → 4/6 here, 1/12 → 10/12 in iteration 17).
2. **A 40–50% tax where nothing is wrong**, paid in reading: every contract is text the agent reads and re-sends.
3. **No help where the needed contract is somewhere the agent doesn't look** (AB2): a contract on the implementation of `$like` doesn't reach code that only *uses* `$like`.

**For Tersa.** Contracts are worth having, but not as more comments in files. The language form should do two things the comments can't:
- **Bring the callee's contract to the call site**, the way a type does. The agent should see "`$like`: unanchored, matches anywhere" where it writes `$like`, not in a file it never opens. The query layer from iterations 3–9 had the right delivery mechanism (show what's relevant without opening files), but the wrong payload: it delivered code, where it should have delivered contracts.
- **Keep them terse and machine-checkable**, so they cost little to read and can't silently go stale.

The next test of that, in TypeScript: put contracts into what the agent already reads. One option is a typecheck-visible form (named types or branded parameters); another is a hook that appends the contracts of the functions a file calls when the agent reads it.

Records: `results/A-ts-baseline/AB*/run-100..105.json`, `results/I-ts-gencontracts/AB*/run-13..18.json`.

## Iteration 19 — Same agent, different harness: pi vs Claude Code (arm P)

**Question (from Vicho: "is this a harness issue? what if we try a modified pi?").** Delivering contracts at the call site is a question of what the harness puts in front of the model, and Claude Code offers little control over tool output. [pi](https://github.com/earendil-works/pi) is a minimal open-source coding agent: a system prompt of ~600 tokens, four tools (read, bash, edit, write), an SDK, and extensions that can rewrite any tool result. Before modifying it, this iteration measures the harness alone. How much of everything measured so far is Claude Code itself?

**Change: arm P** = arm A's prompt, profile, model, effort, caps and sandbox, run on pi 1.5.1 (`@earendil-works/pi-coding-agent`) instead of Claude Code:
- `harness/runner/src/agent-pi.ts` (new): an in-memory pi session; nothing discovered from disk (no extensions, skills, templates or context files: the Actual repo has an AGENTS.md and a CLAUDE.md, which neither harness loads); `effort=low` maps to pi's thinking level `low`, which pi sends to Haiku 5.5 as adaptive thinking with effort `low`, the same setting as the Claude Code runs. Turn, budget and wall-clock caps are the runner's.
- pi's events are translated into the Claude Agent SDK's message shapes (tool names mapped to Read/Bash/Edit/Write), so all metrics, transcripts, `anatomy.ts` and `probe.ts` work unchanged; unit tests in `test/agent-pi.test.ts`.
- Sandbox: same user, same iptables rules, same provider-only proxy (Node's `fetch` needs an explicit proxy dispatcher, set from `HTTPS_PROXY`).
- Also: the bench job now keeps the agent's console output in each run's logs, and `anatomy` commits their tails (`results/analysis/<label>.logs.txt`), because job logs can't be read from outside Actions. That's how the first pilot's failure (a version lookup after the run) was found.
- Pilots (not counted): `results/P-pi-baseline/AB4/run-900` (pass, 6 turns, $0.0025), `AB1/run-900` (fail, the usual workaround).

**Run.** All five tasks, `claude-haiku-5-5`, `effort=low`, 6 runs per task, same period: A runs 106–111, P runs 1–6.

**Result** (all five tasks, `effort=low`, 6 runs per task, same period; per-task mean cost, permutation test P vs A):

| Task | A (Claude Code) pass, cost per pass, turns | P (pi) pass, cost per pass, turns | p (mean cost) |
|---|---|---|---|
| AB1 | 0/6, –, 18.3 | 2/6, $0.0196, 13.0 | 0.06 |
| AB2 | 4/6, $0.0178, 16.0 | 3/6, $0.0194, 14.2 | 0.46 |
| AB3 | 6/6, $0.0062, 11.0 | 6/6, $0.0052, 9.5 | 0.45 |
| AB4 | 6/6, $0.0028, 6.3 | 6/6, $0.0026, 5.2 | 0.41 |
| AB5 | 6/6, $0.0102, 15.8 | 5/6, $0.0095, 12.2 | 0.014 |
| **All** | **22/30, $0.0111** | **22/30, $0.0087 (−22%)** | |

Totals: turns per run 13.5 → 10.8, output 6.7k → 5.5k, cache reads 226k → 134k (−41%). No crashes, no network commands.

**Conclusion.** The harness matters, but less than the code does. pi is about **22% cheaper per passing task at the same pass rate**: fewer turns, and much less context re-sent per turn, because its system prompt and tool definitions are ~6× smaller. That is the same size of effect as everything the query-layer iterations tried for and didn't get. The quality failures are the same in both harnesses: AB1's symptom patch and AB2's `$like` trap appear under pi too. The harness changes what each turn costs, not what the agent gets wrong.

## Iteration 20 — Modified pi: contracts delivered where code is read (arm Q)

**Hypothesis.** Iteration 18's contracts helped where they contradicted the code being edited (AB1), cost 40–50% where nothing was wrong (they made every file longer, on every read), and did nothing where the relevant contract sat in a file nobody opened (AB2). Delivering contracts through the harness, next to the code being read and each only once, should keep the AB1 effect and cut the tax. It also tests whether contracts of *called* functions, shown at the call site, reach code the agent doesn't open.

**Change: arm Q** = arm P (pi) + a pi extension, `arms/Q-pi-contracts/contracts-on-read.ts`, loaded via `piExtension` in the arm's agent.json:
- On every tool result that shows one source file (pi's `read`, or a single-file `cat`/`sed`/`head`/`tail`/`nl` through `bash`; under pi, Haiku reads almost only through bash), it appends the contracts of the functions whose declarations appear in the shown text, and of functions called in it that are defined elsewhere (looked up by name, only if the name is unique). Each contract is shown at most once per session, at most 12 per result, under a header saying it is documentation and not part of the file.
- Contracts: `arms/Q-pi-contracts/contracts.json`, the union of arm I's blind, model-written contracts (264 functions in 15 files). Files are not changed, so edits never see contracts and re-reading unchanged code costs nothing extra.
- Known limit, stated before the run: AB2's trap is reached through a string (`'$like'` in an AQL query), not a function call, so a call-site lookup can't find `unicodeLike`'s contract. AB2 is not expected to improve.

**Run.** All five tasks, `claude-haiku-5-5`, `effort=low`, 6 runs per task, in the same period as iteration 19: Q runs 1–6.

**Result: not a test of the hypothesis (delivery failed).** Q passed 22/30 at $0.0090 per pass, the same as P. But the extension appended contracts in only 6 of 30 runs (`results/analysis/it20.*`: one AB1 run, one AB2 run, three AB4 runs). Agents under pi read files as `cd <workspace>; sed -n 60,120p <file>`, with a `;`, and the extension only recognised `cd <dir> && …`. So the treatment didn't reach the agents. The batch is archived (`results/archive/Q-pi-contracts-it20-undelivered/`) and not scored.

Fix: the extension now splits commands on `;` and `&&`, follows `cd`, allows `| head`/`| tail`/`| nl`/`| sed -n` and `2>/dev/null`, and still refuses edits (`sed -i`, `cat >`) and multi-file commands. Unit tests use command shapes taken from the run logs (`harness/runner/test/contracts-on-read.test.ts`). The lesson matches iteration 4: check that a treatment is actually delivered (here, the extension's per-run "contracts appended" count) before reading its effect.

**Rerun (iteration 20b).** Same design, all five tasks, `effort=low`, 6 runs each, same period: A runs 112–117, P runs 7–12, Q runs 7–12.
