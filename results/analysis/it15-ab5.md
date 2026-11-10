Token anatomy (30 runs; carried input priced as cache reads at $0.01/M, output at $0.5/M)

| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- A-ts-baseline: 0.78 output tokens per visible character, 217 thinking blocks -->
<!-- G-ts-agreement: 0.75 output tokens per visible character, 106 thinking blocks -->
| A-ts-baseline | AB5 | 18 | 19 | 6.3k | 11.2k | 0% | 18% | 6% | 47% | 22% | 6% | 19% | 19% | 62% |
| G-ts-agreement | AB5 | 12 | 16 | 6.3k | 8.6k | 0% | 17% | 4% | 52% | 16% | 12% | 24% | 15% | 61% |
| A-ts-baseline | all | 18 | 19 | 6.3k | 11.2k | 0% | 18% | 6% | 47% | 22% | 6% | 19% | 19% | 62% |
| G-ts-agreement | all | 12 | 16 | 6.3k | 8.6k | 0% | 17% | 4% | 52% | 16% | 12% | 24% | 15% | 61% |

Share of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):

| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|
| A-ts-baseline | 47% | 10% | 10% | 33% |
| G-ts-agreement | 52% | 12% | 7% | 30% |
