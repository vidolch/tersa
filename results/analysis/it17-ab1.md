Token anatomy (24 runs; carried input priced as cache reads at $0.01/M, output at $0.5/M)

| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- A-ts-baseline: 0.68 output tokens per visible character, 111 thinking blocks -->
<!-- I-ts-gencontracts: 0.70 output tokens per visible character, 61 thinking blocks -->
| A-ts-baseline | AB1 | 12 | 18 | 6.2k | 8.2k | 0% | 22% | 6% | 68% | 4% | 0% | 40% | 22% | 38% |
| I-ts-gencontracts | AB1 | 12 | 11 | 6.2k | 3.7k | 0% | 32% | 1% | 59% | 8% | 0% | 50% | 11% | 40% |
| A-ts-baseline | all | 12 | 18 | 6.2k | 8.2k | 0% | 22% | 6% | 68% | 4% | 0% | 40% | 22% | 38% |
| I-ts-gencontracts | all | 12 | 11 | 6.2k | 3.7k | 0% | 32% | 1% | 59% | 8% | 0% | 50% | 11% | 40% |

Share of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):

| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|
| A-ts-baseline | 60% | 16% | 9% | 15% |
| I-ts-gencontracts | 58% | 21% | 4% | 17% |
