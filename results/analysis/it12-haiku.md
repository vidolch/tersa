Token anatomy (72 runs; carried input priced as cache reads at $0.01/M, output at $0.5/M)

| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- A-ts-baseline: 0.75 output tokens per visible character, 998 thinking blocks -->
| A-ts-baseline | AB1 | 18 | 25 | 6.2k | 12.4k | 0% | 22% | 8% | 61% | 9% | 0% | 28% | 25% | 47% |
| A-ts-baseline | AB2 | 18 | 30 | 6.1k | 17.3k | 0% | 20% | 7% | 58% | 11% | 5% | 15% | 25% | 60% |
| A-ts-baseline | AB3 | 18 | 19 | 6.2k | 11.3k | 0% | 20% | 9% | 59% | 12% | 0% | 27% | 26% | 47% |
| A-ts-baseline | AB4 | 18 | 15 | 6.1k | 6.8k | 0% | 27% | 14% | 44% | 15% | 0% | 32% | 20% | 48% |
| A-ts-baseline | all | 72 | 22 | 6.2k | 11.9k | 0% | 21% | 8% | 57% | 11% | 2% | 22% | 25% | 53% |

Share of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):

| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|
| A-ts-baseline | 49% | 11% | 12% | 27% |
