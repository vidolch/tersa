Token anatomy (24 runs; carried input priced as cache reads at $0.01/M, output at $0.5/M)

| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- A-ts-baseline: 0.74 output tokens per visible character, 108 thinking blocks -->
<!-- F-ts-exhaustive: 0.76 output tokens per visible character, 117 thinking blocks -->
| A-ts-baseline | AB2 | 12 | 14 | 6.2k | 8.6k | 0% | 12% | 10% | 71% | 2% | 5% | 26% | 17% | 56% |
| F-ts-exhaustive | AB2 | 12 | 15 | 6.2k | 9.7k | 0% | 12% | 11% | 59% | 9% | 10% | 26% | 19% | 55% |
| A-ts-baseline | all | 12 | 14 | 6.2k | 8.6k | 0% | 12% | 10% | 71% | 2% | 5% | 26% | 17% | 56% |
| F-ts-exhaustive | all | 12 | 15 | 6.2k | 9.7k | 0% | 12% | 11% | 59% | 9% | 10% | 26% | 19% | 55% |

Share of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):

| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|
| A-ts-baseline | 56% | 12% | 8% | 25% |
| F-ts-exhaustive | 58% | 11% | 8% | 23% |
