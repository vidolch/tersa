# Task: AB6 Moving categories puts them in the wrong place
Type: bug
Start state: Actual Budget at the suite's pinned commit, with a regression

## Report
Users report that reordering categories is off by one. Dragging a category onto another one (the app sends `category-move` with the category it was dropped on as the target) leaves it one position lower than where it was dropped. Sorting a group's categories by name ("Sort A→Z" / "Sort Z→A", `categories-sort`) leaves them in a scrambled order. Fix it without changing correct behaviour.

## Interface
Server handlers, reached through `@actual-app/api`'s `internal.send`:
```
category-move    { id, groupId, targetId }   targetId: the category it was dropped on, or null
categories-sort  { groupId, direction: "asc" | "desc" }
```

## Rules
R1. `category-move` with a target places the category directly before the target, in the target's group.
R2. `category-move` with `targetId: null` places the category last in the group.
R3. `categories-sort` orders the group's categories by name, ascending or descending as asked.

## Constraints
- Backend only. All existing tests must still pass.

## Out of scope
UI. Moving transactions.
