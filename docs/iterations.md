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

## Iteration 7 — First full comparison (planned)
**Date** 2026-11-03 · **Arms** A runs 9–14 and B v1.2 runs 2–7, 6 runs per task each, started together (3 concurrent runs per arm) · **Status** running

**Hypothesis.** B v1.2 costs less than A on the Actual suite at equal pass rate; with 12–27% run-to-run variance, 6 runs per arm can show a difference of about 25–30%.
