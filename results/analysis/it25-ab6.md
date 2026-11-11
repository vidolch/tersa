Token anatomy (24 runs; carried input priced as cache reads at $0.01/M, output at $0.5/M)

| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- P-pi-baseline: 0.75 output tokens per visible character, 74 thinking blocks -->
<!-- R-pi-name: 0.77 output tokens per visible character, 66 thinking blocks -->
| P-pi-baseline | AB6 | 12 | 14 | 3.2k | 7.1k | 28% | 12% | 20% | 29% | 10% | 0% | 26% | 18% | 56% |
| R-pi-name | AB6 | 12 | 12 | 3.2k | 6.0k | 29% | 14% | 18% | 36% | 2% | 0% | 27% | 15% | 58% |
| P-pi-baseline | all | 12 | 14 | 3.2k | 7.1k | 28% | 12% | 20% | 29% | 10% | 0% | 26% | 18% | 56% |
| R-pi-name | all | 12 | 12 | 3.2k | 6.0k | 29% | 14% | 18% | 36% | 2% | 0% | 27% | 15% | 58% |

Share of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):

| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|
| P-pi-baseline | 68% | 8% | 6% | 18% |
| R-pi-name | 69% | 9% | 5% | 18% |
