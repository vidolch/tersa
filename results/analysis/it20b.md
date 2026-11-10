Token anatomy (60 runs; carried input priced as cache reads at $0.01/M, output at $0.5/M)

| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- P-pi-baseline: 0.68 output tokens per visible character, 188 thinking blocks -->
<!-- Q-pi-contracts: 0.68 output tokens per visible character, 177 thinking blocks -->
| P-pi-baseline | AB1 | 6 | 18 | 3.4k | 7.7k | 22% | 13% | 5% | 60% | 0% | 0% | 26% | 17% | 57% |
| P-pi-baseline | AB2 | 6 | 17 | 3.4k | 9.4k | 27% | 10% | 15% | 47% | 1% | 0% | 16% | 16% | 68% |
| P-pi-baseline | AB3 | 6 | 10 | 3.5k | 5.0k | 22% | 11% | 6% | 57% | 4% | 0% | 28% | 17% | 55% |
| P-pi-baseline | AB4 | 6 | 5 | 3.4k | 2.0k | 26% | 28% | 0% | 31% | 15% | 0% | 47% | 7% | 46% |
| P-pi-baseline | AB5 | 6 | 13 | 3.6k | 6.5k | 28% | 10% | 12% | 51% | 0% | 0% | 19% | 11% | 70% |
| Q-pi-contracts | AB1 | 6 | 14 | 3.4k | 6.1k | 24% | 14% | 2% | 58% | 1% | 0% | 29% | 16% | 55% |
| Q-pi-contracts | AB2 | 6 | 14 | 3.4k | 7.6k | 31% | 8% | 14% | 47% | 0% | 0% | 19% | 11% | 70% |
| Q-pi-contracts | AB3 | 6 | 10 | 3.5k | 5.6k | 22% | 10% | 20% | 43% | 5% | 0% | 28% | 14% | 58% |
| Q-pi-contracts | AB4 | 6 | 6 | 3.4k | 2.0k | 26% | 26% | 0% | 34% | 14% | 0% | 44% | 7% | 49% |
| Q-pi-contracts | AB5 | 6 | 12 | 3.6k | 7.2k | 24% | 10% | 11% | 54% | 0% | 0% | 19% | 11% | 69% |
| P-pi-baseline | all | 30 | 12 | 3.5k | 6.1k | 25% | 12% | 10% | 52% | 2% | 0% | 22% | 15% | 63% |
| Q-pi-contracts | all | 30 | 11 | 3.5k | 5.7k | 26% | 12% | 11% | 49% | 2% | 0% | 24% | 12% | 64% |

Share of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):

| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|
| P-pi-baseline | 61% | 9% | 6% | 25% |
| Q-pi-contracts | 64% | 9% | 5% | 23% |
