# Task: HN2 The language detector picks the least preferred language
Type: bug
Start state: Hono at the suite's pinned commit, with a regression

## Report
With the `languageDetector` middleware and detection from the `Accept-Language` header, a request with `Accept-Language: fr;q=0.5, en` and supported languages `['en', 'fr']` gets `fr`, although the client prefers `en` (quality 1). It only happens when the header doesn't already list languages from most to least preferred.

## Rules
R1. `languageDetector` with header detection picks the supported language with the highest quality value from `Accept-Language`, whatever order the header lists them in.
R2. Ties in quality keep the order of the header (the first listed wins).
R3. Other users of quality-ranked `Accept*` headers give the same preference order (for example, the `accepts` helper with `Accept` and `Accept-Language`).

## Constraints
- Fix the cause, without changing correct behaviour.
- All existing tests must still pass.

## Out of scope
New detector options. Language-tag normalisation.

## Visible example
```
Accept-Language: fr;q=0.5, en       supported ['en','fr']  → 'en'
Accept-Language: de, en;q=0.9       supported ['en','de']  → 'de'
```
