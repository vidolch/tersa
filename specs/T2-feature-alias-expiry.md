# Task: T2 Custom aliases and expiry
Type: feature
Start state: `reference/T1` (all T1 rules pass)

## Goal
Let callers choose the short code and optionally set an expiry time after which the link stops redirecting.

## Interface

`POST /links`
- Request: `{ "url": string, "alias"?: string, "expiresAt"?: string }`
- `201`: link object (below)

Link object, returned by `POST /links` and `GET /links/{code}`:
`{ "code": string, "url": string, "createdAt": string, "expiresAt": string | null, "clicks": number }`

## Rules
R1. If `alias` is given and valid, the link's `code` equals `alias`.
R2. A valid alias is 3–32 characters from `[A-Za-z0-9_-]`. Anything else returns `400 { "error": "invalid_alias" }`.
R3. Aliases are case-sensitive: `Docs` and `docs` are different codes.
R4. An alias equal to an existing code (generated or custom) returns `409 { "error": "alias_taken" }`.
R5. The aliases `links` and `healthz` (exact, case-sensitive) are reserved and return `400 { "error": "invalid_alias" }`.
R6. `expiresAt` must be an ISO 8601 timestamp with timezone, strictly in the future. Otherwise `400 { "error": "invalid_expiry" }`.
R7. Without `expiresAt`, the link object has `"expiresAt": null` and never expires.
R8. Once the current time is at or after `expiresAt`, `GET /{code}` returns `410 { "error": "expired" }`.
R9. `GET /links/{code}` still returns `200` with the link object for an expired link.
R10. Generated codes (T1 R2) never collide with existing aliases.
R11. When a request has several problems, validation order is: `invalid_json`, `invalid_url`, `invalid_alias`, `invalid_expiry`, `alias_taken`.

All T1 rules still hold, with the link object extended as above.

## Constraints
Same as T1.

## Out of scope
Changing alias or expiry after creation. Expired-link cleanup.

## Visible examples

```
POST /links {"url":"https://example.com/docs","alias":"docs"}
→ 201 {"code":"docs","url":"https://example.com/docs","createdAt":"...","expiresAt":null,"clicks":0}

POST /links {"url":"https://example.com/other","alias":"docs"}
→ 409 {"error":"alias_taken"}

GET /old-promo   (expired)
→ 410 {"error":"expired"}
```
