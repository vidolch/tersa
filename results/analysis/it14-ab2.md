Token anatomy (24 runs; carried input priced as cache reads at $0.01/M, output at $0.5/M)

| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- A-ts-baseline: 0.74 output tokens per visible character, 113 thinking blocks -->
<!-- G-ts-agreement: 0.79 output tokens per visible character, 146 thinking blocks -->
| A-ts-baseline | AB2 | 12 | 15 | 6.2k | 9.1k | 0% | 12% | 15% | 56% | 7% | 10% | 25% | 17% | 58% |
| G-ts-agreement | AB2 | 12 | 19 | 6.2k | 10.3k | 0% | 15% | 3% | 70% | 6% | 6% | 25% | 21% | 54% |
| A-ts-baseline | all | 12 | 15 | 6.2k | 9.1k | 0% | 12% | 15% | 56% | 7% | 10% | 25% | 17% | 58% |
| G-ts-agreement | all | 12 | 19 | 6.2k | 10.3k | 0% | 15% | 3% | 70% | 6% | 6% | 25% | 21% | 54% |

Share of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):

| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|
| A-ts-baseline | 55% | 11% | 8% | 26% |
| G-ts-agreement | 52% | 12% | 10% | 26% |
