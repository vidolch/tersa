Token anatomy (1 runs; carried input priced as cache reads at $0.01/M, output at $0.5/M)

| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- P-pi-baseline: 0.86 output tokens per visible character, 1 thinking blocks -->
| P-pi-baseline | AB4 | 1 | 4 | 3.4k | 1.2k | 33% | 9% | 0% | 33% | 25% | 0% | 49% | 5% | 46% |
| P-pi-baseline | all | 1 | 4 | 3.4k | 1.2k | 33% | 9% | 0% | 33% | 25% | 0% | 49% | 5% | 46% |

Share of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):

| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|
| P-pi-baseline | 69% | 15% | 1% | 14% |
