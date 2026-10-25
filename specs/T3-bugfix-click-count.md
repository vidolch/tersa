# Task: T3 Click counts too high
Type: bugfix
Start state: `reference/T3-start` (`reference/T2` with an injected defect)

## Goal
Users report that click counts are higher than the real number of visits. Fix it without changing correct behavior.

## Report
> Our marketing link shows ~3× more clicks than our analytics tool. Chat apps fetch link previews, and we also have some expired campaign links that still seem to gain clicks.

Reproduction:
```
POST /links {"url":"https://example.com","alias":"promo"}
HEAD /promo          (×3)
GET  /links/promo    → "clicks": 3   (expected 0)
```

## Rules
R1. `HEAD /{code}` returns the same status code and `Location` header as `GET /{code}` would, with an empty body.
R2. `HEAD /{code}` never changes `clicks`.
R3. A `GET /{code}` that returns `410` never changes `clicks`.
R4. A `GET /{code}` that returns `302` still increments `clicks` by exactly 1.

All T1 and T2 rules still hold.

## Constraints
Same as T1. Keep the change minimal: no new endpoints or dependencies.

## Out of scope
Bot detection by user agent. Deduplicating repeat visitors.
