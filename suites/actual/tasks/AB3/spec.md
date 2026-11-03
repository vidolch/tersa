# Task: AB3 Upcoming schedules API
Type: feature
Start state: Actual Budget at the suite's pinned commit

## Goal
Add a public API method that lists every upcoming occurrence of every active schedule in a date range.

## Interface
New export in `@actual-app/api`:
```
getUpcomingSchedules({ start: string, end: string }): Promise<Array<{
  scheduleId: string,
  name: string | null,
  date: string,               // YYYY-MM-DD
  amount: number | { num1: number, num2: number },
  amountOp: "is" | "isapprox" | "isbetween",
  payee: string | null,
  account: string | null,
}>>
```

## Rules
R1. Returns one entry per occurrence date of each schedule within `[start, end]` (inclusive). The dates of a schedule are exactly the ones the app's own schedule date expansion produces for it (what `getScheduleDates(schedule.date, { start, end })` returns), including weekend moves and months a recurrence skips.
R2. `name`, `amount`, `amountOp`, `payee` and `account` equal the schedule's values as returned by `getSchedules`; missing `payee` / `account` are `null`.
R3. Entries are ordered by `date` ascending, then `name` ascending, then `scheduleId` ascending.
R4. Completed schedules are excluded.
R5. `start` and `end` are required `YYYY-MM-DD` dates, `end` must not be before `start`, and the range may cover at most 366 days (inclusive). Otherwise the call throws.
R6. A single-day range (`start == end`) returns only that day's occurrences.

## Constraints
- Change only code under `packages/`.
- Existing API methods keep their behavior. All existing tests must still pass.

## Out of scope
UI. Posting transactions for schedules.

## Visible examples
```
getUpcomingSchedules({ start: "2027-03-01", end: "2027-03-07" })
→ [ { scheduleId: "…", name: "Gym", date: "2027-03-05", amount: -2500, amountOp: "is", payee: null, account: "…" } ]
```
