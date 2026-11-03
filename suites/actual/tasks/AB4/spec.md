# Task: AB4 Overspending is carried over wrongly
Type: bugfix
Start state: Actual Budget at the suite's pinned commit with `start.patch` applied. Run in a fresh session.

## Goal
Users of envelope budgeting report wrong "To Budget" amounts after overspending. Fix it without changing correct behavior.

## Report
> I overspent Food by 50 in January. Food has no rollover, so February's "To Budget" should go down by 50, but it doesn't change. My General category has rollover on and I overspent it by 30: February shows General at −30, which is right, but February's "To Budget" also went down by 30, so it's counted twice.

Reproduction, through `@actual-app/api` (amounts in cents):
```
setBudgetAmount("2027-01", <Food>, 10000)        // no rollover
add a −15000 Food transaction on 2027-01-15
getBudgetMonth("2027-02").lastMonthOverspent → 0      (expected −5000)
```

## Rules
R1. Overspending in a category without rollover reduces the next month's `toBudget` by the overspent amount; the next month's `lastMonthOverspent` is that negative amount.
R2. A category without rollover starts the next month at balance 0 after being overspent.
R3. Overspending in a category with rollover carries into that category's next-month balance and is not deducted from the next month's `toBudget`.
R4. With both kinds in one month, only the non-rollover overspending is deducted, each amount exactly once.
R5. Positive leftovers roll into the next month's category balance whether rollover is on or not.

## Constraints
- Change only code under `packages/`. Do not change the public API.
- All existing tests must still pass.

## Out of scope
Tracking budgets. UI.
