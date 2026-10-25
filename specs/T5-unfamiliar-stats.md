# Task: T5 Daily click stats
Type: unfamiliar-change
Start state: `reference/T4` (all T1–T4 rules pass). Run in a **fresh agent session** with no prior context of the codebase.

## Goal
Add an endpoint that reports clicks per UTC day for a link.

## Interface

`GET /links/{code}/stats?days={n}`
- `200`:
```
{
  "code": string,
  "total": number,
  "daily": [ { "date": "YYYY-MM-DD", "clicks": number } ]
}
```

## Rules
R1. `days` defaults to 7. Valid values are integers 1–90. Anything else returns `400 { "error": "invalid_days" }`.
R2. `daily` has exactly `days` entries, ordered oldest to newest, one per UTC date, ending with today (UTC). Days without clicks are present with `"clicks": 0`.
R3. Each `302` redirect (T1 R7) adds 1 to the entry for the UTC date on which it happened.
R4. `total` equals the link's `clicks` value from `GET /links/{code}`.
R5. Unknown code returns `404 { "error": "not_found" }`. Expired links return `200` with their stats.
R6. Stats work with both `STORAGE=file` and `STORAGE=memory`, and with `file` they survive a restart.

All T1–T4 rules still hold. T4 R5 (structural) still holds.

## Constraints
Same as T1. No new runtime dependencies.

## Out of scope
Per-hour stats, referrers, unique visitors.

## Visible examples

```
GET /links/docs/stats?days=3
→ 200 {"code":"docs","total":5,"daily":[
        {"date":"2026-10-23","clicks":0},
        {"date":"2026-10-24","clicks":2},
        {"date":"2026-10-25","clicks":3}]}
```
