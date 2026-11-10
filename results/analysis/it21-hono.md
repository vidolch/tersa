Token anatomy (96 runs; carried input priced as cache reads at $0.01/M, output at $0.5/M)

| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- A-ts-baseline: 0.93 output tokens per visible character, 193 thinking blocks -->
<!-- P-pi-baseline: 0.75 output tokens per visible character, 98 thinking blocks -->
<!-- Q-pi-contracts: 0.86 output tokens per visible character, 103 thinking blocks -->
| A-ts-baseline | HN1 | 8 | 5 | 6.0k | 1.8k | 0% | 35% | 36% | 19% | 10% | 0% | 65% | 8% | 28% |
| A-ts-baseline | HN2 | 8 | 7 | 5.9k | 2.7k | 0% | 35% | 30% | 23% | 10% | 1% | 60% | 11% | 29% |
| A-ts-baseline | HN3 | 8 | 22 | 6.1k | 22.0k | 0% | 16% | 26% | 57% | 1% | 0% | 21% | 45% | 34% |
| A-ts-baseline | HN4 | 8 | 4 | 6.0k | 1.7k | 0% | 26% | 26% | 13% | 34% | 2% | 67% | 7% | 26% |
| P-pi-baseline | HN1 | 8 | 5 | 3.2k | 1.7k | 17% | 27% | 32% | 22% | 2% | 0% | 51% | 9% | 40% |
| P-pi-baseline | HN2 | 8 | 5 | 3.2k | 2.4k | 11% | 25% | 46% | 11% | 6% | 0% | 42% | 11% | 47% |
| P-pi-baseline | HN3 | 8 | 12 | 3.3k | 9.4k | 43% | 7% | 33% | 17% | 0% | 0% | 20% | 20% | 60% |
| P-pi-baseline | HN4 | 8 | 3 | 3.3k | 1.0k | 3% | 23% | 25% | 48% | 0% | 0% | 63% | 6% | 31% |
| Q-pi-contracts | HN1 | 8 | 6 | 3.2k | 2.0k | 16% | 23% | 39% | 19% | 3% | 0% | 43% | 9% | 48% |
| Q-pi-contracts | HN2 | 8 | 5 | 3.2k | 2.0k | 13% | 25% | 37% | 20% | 5% | 0% | 42% | 8% | 50% |
| Q-pi-contracts | HN3 | 8 | 13 | 3.3k | 11.3k | 52% | 5% | 22% | 20% | 0% | 0% | 15% | 15% | 69% |
| Q-pi-contracts | HN4 | 8 | 3 | 3.3k | 1.4k | 3% | 19% | 61% | 7% | 9% | 0% | 58% | 7% | 34% |
| A-ts-baseline | all | 32 | 9 | 6.0k | 7.1k | 0% | 20% | 27% | 49% | 4% | 0% | 29% | 38% | 33% |
| P-pi-baseline | all | 32 | 6 | 3.2k | 3.6k | 32% | 13% | 35% | 19% | 1% | 0% | 29% | 17% | 55% |
| Q-pi-contracts | all | 32 | 7 | 3.2k | 4.2k | 39% | 11% | 29% | 19% | 2% | 0% | 23% | 13% | 64% |

Share of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):

| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|
| A-ts-baseline | 65% | 10% | 14% | 12% |
| P-pi-baseline | 72% | 8% | 5% | 15% |
| Q-pi-contracts | 69% | 7% | 4% | 20% |
