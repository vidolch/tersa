# Task: AB5 `isbetween` for date rule conditions
Type: feature
Start state: Actual Budget at the suite's pinned commit

## Goal
Allow the `isbetween` operator, which today exists only for amounts, on the transaction `date` field: a date range, usable everywhere rule conditions are used: rule matching and filters built from conditions.

## Interface
Rule condition, as accepted by `createRule` / `updateRule` and returned by `getRules` in `@actual-app/api`:
```
{ op: "isbetween", field: "date", value: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" } }
```

## Rules
R1. `createRule` accepts `isbetween` on `date` with a `{ from, to }` value of two exact dates. It rejects, the same way other invalid conditions are rejected: a value that is a single date string, a value missing `from` or `to`, and `from`/`to` that are not exact `YYYY-MM-DD` dates (for example a month `2026-10`).
R2. On import, the condition matches a transaction whose date is on or after `from` and on or before `to` (both ends included), and no other.
R3. The order of the two ends does not matter: `{ from: "2026-10-31", to: "2026-10-01" }` means the same range as `{ from: "2026-10-01", to: "2026-10-31" }`.
R4. A rule with a date `isbetween` condition round-trips through `getRules` unchanged (`op`, `field`, `value`).
R5. Filters built from conditions (the `make-filters-from-conditions` handler used by the app for rule previews and filters) support date `isbetween` with the same semantics as R2 and R3, on existing transactions.

## Constraints
- Change only code under `packages/`. Backend only.
- All existing tests must still pass. Amount `isbetween` keeps working exactly as before.

## Out of scope
UI (the rule editor, filter menus). Recurring dates, months and years as range ends. Other date fields.

## Visible examples
```
rule: date isbetween { from: "2026-10-01", to: "2026-10-31" }
  2026-10-01 → matches
  2026-10-31 → matches
  2026-11-01 → no match
```
