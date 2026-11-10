Token anatomy (48 runs; carried input priced as cache reads at $0.01/M, output at $0.5/M)

| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- A-ts-baseline: 0.73 output tokens per visible character, 581 thinking blocks -->
| A-ts-baseline | AB1 | 12 | 23 | 6.2k | 10.9k | 0% | 19% | 9% | 69% | 3% | 0% | 31% | 25% | 44% |
| A-ts-baseline | AB2 | 12 | 25 | 6.1k | 14.3k | 0% | 15% | 8% | 71% | 3% | 2% | 18% | 24% | 58% |
| A-ts-baseline | AB3 | 12 | 18 | 6.2k | 10.3k | 0% | 18% | 9% | 62% | 11% | 0% | 27% | 26% | 47% |
| A-ts-baseline | AB4 | 12 | 13 | 6.1k | 5.8k | 0% | 27% | 19% | 42% | 11% | 1% | 34% | 19% | 47% |
| A-ts-baseline | all | 48 | 20 | 6.2k | 10.3k | 0% | 19% | 10% | 64% | 6% | 1% | 25% | 24% | 51% |

Share of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):

| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|
| A-ts-baseline | 51% | 12% | 12% | 25% |
