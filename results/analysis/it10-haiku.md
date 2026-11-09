Token anatomy (48 runs; carried input priced as cache reads at $0.01/M, output at $0.5/M)

| Arm | Task | Runs | Requests | Start context | Output | thinking | text | shell edits | other shell | Edit/Write | other tools | Carried: start | own output | tool results |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A-ts-baseline | AB1 | 6 | 29 | 6.2k | 14.8k | 0% | 22% | 4% | 63% | 10% | 0% | 25% | 29% | 46% |
| A-ts-baseline | AB2 | 6 | 35 | 6.1k | 21.9k | 0% | 17% | 6% | 72% | 4% | 1% | 16% | 26% | 58% |
| A-ts-baseline | AB3 | 6 | 25 | 6.2k | 14.0k | 0% | 20% | 8% | 58% | 14% | 0% | 24% | 26% | 50% |
| A-ts-baseline | AB4 | 6 | 20 | 6.1k | 9.5k | 0% | 24% | 20% | 40% | 15% | 0% | 30% | 22% | 47% |
| D-ts-bundle | AB1 | 6 | 26 | 16.3k | 13.6k | 0% | 18% | 8% | 68% | 1% | 4% | 45% | 20% | 35% |
| D-ts-bundle | AB2 | 6 | 33 | 16.0k | 21.2k | 0% | 23% | 6% | 63% | 7% | 2% | 34% | 24% | 43% |
| D-ts-bundle | AB3 | 6 | 20 | 16.5k | 12.8k | 0% | 21% | 10% | 55% | 13% | 0% | 50% | 21% | 30% |
| D-ts-bundle | AB4 | 6 | 20 | 15.1k | 11.6k | 0% | 27% | 10% | 47% | 17% | 0% | 45% | 21% | 34% |
| A-ts-baseline | all | 24 | 27 | 6.2k | 15.0k | 0% | 20% | 8% | 61% | 10% | 1% | 21% | 26% | 52% |
| D-ts-bundle | all | 24 | 25 | 16.0k | 14.8k | 0% | 22% | 8% | 59% | 9% | 2% | 41% | 22% | 37% |

Share of cost (approximate: carried input at the cache-hit price, output at the output price; cache writes not split):

| Arm | Output | Start context re-sent | Own output re-sent | Tool results re-sent |
|---|---|---|---|---|
| A-ts-baseline | 49% | 11% | 13% | 27% |
| D-ts-bundle | 44% | 23% | 12% | 21% |
