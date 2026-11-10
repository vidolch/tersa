Token anatomy (24 runs; carried input priced as cache reads at $0.01/M, output at $0.5/M)

| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- A-ts-baseline: 0.67 output tokens per visible character, 120 thinking blocks -->
<!-- H-ts-contracts: 0.65 output tokens per visible character, 38 thinking blocks -->
| A-ts-baseline | AB1 | 12 | 19 | 6.2k | 8.8k | 0% | 23% | 5% | 63% | 9% | 1% | 37% | 23% | 40% |
| H-ts-contracts | AB1 | 12 | 7 | 6.2k | 2.2k | 0% | 37% | 3% | 48% | 12% | 0% | 58% | 7% | 34% |
| A-ts-baseline | all | 12 | 19 | 6.2k | 8.8k | 0% | 23% | 5% | 63% | 9% | 1% | 37% | 23% | 40% |
| H-ts-contracts | all | 12 | 7 | 6.2k | 2.2k | 0% | 37% | 3% | 48% | 12% | 0% | 58% | 7% | 34% |

Share of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):

| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|
| A-ts-baseline | 58% | 16% | 10% | 17% |
| H-ts-contracts | 58% | 24% | 3% | 14% |
