# Results

Generated 2026-11-09T13:05:00.986Z. Independent runs only (chained runs excluded). Runs that crashed on a provider error ("+N crashed") and runs that used the network without the provider-only policy ("+N invalid") are listed but not scored.

| Arm | Task | Model | Runs | Pass | Cost/pass $ | Median $ | Median input tok | Median output tok | Median tool calls | Median repeat reads | Median read precision | Median read tok |
|-----|------|-------|------|------|-------------|----------|------------------|-------------------|-------------------|---------------------|-----------------------|-----------------|
| A-ts-baseline | T1 | deepseek-v4-flash | 6 | 6 | 0.012 | 0.011 | 641,223 | 25,387 | 37 | 0 | – | – |
| A-ts-baseline | T2 | deepseek-v4-flash | 5 | 5 | 0.009 | 0.009 | 382,711 | 19,312 | 30 | 0 | – | – |
| A-ts-baseline | T3 | deepseek-v4-flash | 5 | 5 | 0.004 | 0.003 | 111,990 | 4,956 | 12 | 0 | – | – |
| A-ts-baseline | T4 | deepseek-v4-flash | 5 | 5 | 0.011 | 0.011 | 598,896 | 16,305 | 32 | 0 | – | – |
| A-ts-baseline | T5 | deepseek-v4-flash | 5 | 5 | 0.011 | 0.01 | 619,962 | 18,498 | 30 | 0 | – | – |
