Token anatomy (60 runs; carried input priced as cache reads at $0.01/M, output at $0.5/M)

| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- P-pi-baseline: 0.69 output tokens per visible character, 177 thinking blocks -->
<!-- Q-pi-contracts: 0.67 output tokens per visible character, 166 thinking blocks -->
| P-pi-baseline | AB1 | 6 | 15 | 3.4k | 7.0k | 29% | 13% | 4% | 53% | 0% | 1% | 27% | 18% | 55% |
| P-pi-baseline | AB2 | 6 | 18 | 3.4k | 8.0k | 26% | 9% | 9% | 57% | 0% | 0% | 20% | 15% | 65% |
| P-pi-baseline | AB3 | 6 | 8 | 3.5k | 4.6k | 22% | 11% | 14% | 53% | 0% | 0% | 30% | 13% | 57% |
| P-pi-baseline | AB4 | 6 | 5 | 3.4k | 2.0k | 30% | 28% | 1% | 28% | 13% | 0% | 45% | 6% | 49% |
| P-pi-baseline | AB5 | 6 | 14 | 3.6k | 6.8k | 24% | 10% | 8% | 55% | 3% | 0% | 20% | 13% | 67% |
| Q-pi-contracts | AB1 | 6 | 10 | 3.4k | 4.3k | 26% | 16% | 5% | 50% | 3% | 0% | 31% | 13% | 56% |
| Q-pi-contracts | AB2 | 6 | 16 | 3.4k | 8.2k | 25% | 9% | 16% | 50% | 0% | 0% | 17% | 14% | 69% |
| Q-pi-contracts | AB3 | 6 | 10 | 3.5k | 5.5k | 26% | 9% | 16% | 45% | 4% | 0% | 27% | 13% | 60% |
| Q-pi-contracts | AB4 | 6 | 5 | 3.4k | 2.0k | 28% | 28% | 0% | 30% | 14% | 0% | 40% | 5% | 55% |
| Q-pi-contracts | AB5 | 6 | 11 | 3.6k | 6.0k | 26% | 9% | 16% | 50% | 0% | 0% | 19% | 9% | 73% |
| P-pi-baseline | all | 30 | 12 | 3.5k | 5.7k | 26% | 12% | 8% | 53% | 2% | 0% | 24% | 14% | 62% |
| Q-pi-contracts | all | 30 | 10 | 3.5k | 5.2k | 26% | 12% | 13% | 47% | 2% | 0% | 22% | 12% | 66% |

Share of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):

| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|
| P-pi-baseline | 62% | 9% | 5% | 23% |
| Q-pi-contracts | 61% | 9% | 5% | 26% |
