# Task: AB1 Specific rules lose to generic rules
Type: bugfix
Start state: Actual Budget at the suite's pinned commit with `start.patch` applied

## Goal
Users report that transaction rules are applied in the wrong order. Fix it without changing correct behavior.

## Report
> I have a rule "imported payee contains `lidl`" → category General, and a more specific rule "imported payee is `lidl sofia`" → Food. Every LIDL SOFIA transaction ends up in General. The app docs say more specific rules win. Rules in the `post` stage still seem to work.

Reproduction, through `@actual-app/api`:
```
createRule({ stage: null, conditionsOp: "and",
  conditions: [{ op: "contains", field: "imported_payee", value: "lidl" }],
  actions: [{ op: "set", field: "category", value: <General> }] })
createRule({ stage: null, conditionsOp: "and",
  conditions: [{ op: "is", field: "imported_payee", value: "lidl sofia" }],
  actions: [{ op: "set", field: "category", value: <Food> }] })
importTransactions(account, [{ date: "2026-10-01", amount: -1000, imported_payee: "LIDL SOFIA" }])
→ transaction category is General   (expected Food)
```

## Rules
R1. When an `is` rule and a `contains` rule both set the category, the `is` rule's value is the final one.
R2. The more specific rule wins regardless of the order the rules were created in (`oneOf` is more specific than `contains`).
R3. A rule with more exact conditions wins over a rule with fewer.
R4. Rules in the `post` stage are still applied after all default-stage rules.

## Constraints
- Change only code under `packages/`. Do not change the public API.
- All existing tests must still pass.

## Out of scope
UI changes. Changing how specificity is scored.
