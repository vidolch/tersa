# Task: AB2 `startsWith` rule condition
Type: feature
Start state: Actual Budget at the suite's pinned commit

## Goal
Add a `startsWith` operator for string rule conditions on `imported_payee` and `notes`, usable everywhere rule conditions are used: rule matching and filters built from conditions.

## Interface
Rule condition, as accepted by `createRule` / `updateRule` and returned by `getRules` in `@actual-app/api`:
```
{ op: "startsWith", field: "imported_payee" | "notes", value: string }
```

## Rules
R1. `createRule` accepts `startsWith` on `imported_payee` and `notes`. It rejects `startsWith` on non-string fields (e.g. `amount`, `date`) and with an empty string value, the same way other invalid conditions are rejected.
R2. On import, a `startsWith` condition matches when the field value begins with the condition value, ignoring letter case. It does not match the value anywhere else in the field.
R3. A `startsWith` condition on `notes` never matches a transaction without notes.
R4. A rule with a `startsWith` condition round-trips through `getRules` unchanged (`op`, `field`, `value`).
R5. Filters built from conditions (the `make-filters-from-conditions` handler used by the app for rule previews and filters) support `startsWith` with the same semantics as R2, on existing transactions.

## Constraints
- Change only code under `packages/`. Backend only.
- All existing tests must still pass.

## Out of scope
UI (the rule editor, filter menus). Other fields (`payee`, `category`, `account`).

## Visible examples
```
rule: imported_payee startsWith "Lidl"
  "LIDL SOFIA" → matches
  "My Lidl"    → no match
```
