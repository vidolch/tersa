# Task: T1 URL shortener
Type: initial
Start state: empty scaffold (`arms/<arm>/scaffold/`)

## Goal
Build an HTTP service that shortens URLs, redirects short codes to their target, and counts redirects.

## Interface

`POST /links`
- Request: `{ "url": string }`
- `201`: `{ "code": string, "url": string, "createdAt": string, "clicks": 0 }`

`GET /{code}`
- `302` with `Location: <url>`

`GET /links/{code}`
- `200`: `{ "code": string, "url": string, "createdAt": string, "clicks": number }`

`DELETE /links/{code}`
- `204`, empty body

`GET /healthz`
- `200`

## Rules
R1. `POST /links` with an absolute `http` or `https` URL returns `201` and the link object. `createdAt` is an ISO 8601 UTC timestamp.
R2. `code` is exactly 7 characters from `[A-Za-z0-9]`.
R3. Every created link gets a unique code, including when the same URL is submitted more than once.
R4. `url` that is missing, not a string, not absolute, uses a scheme other than `http`/`https`, or is longer than 2048 characters returns `400 { "error": "invalid_url" }`.
R5. A request body that is not valid JSON returns `400 { "error": "invalid_json" }`.
R6. `GET /{code}` for an existing link returns `302` with `Location` equal to the stored `url`.
R7. Each `GET /{code}` that returns `302` increments `clicks` by exactly 1.
R8. `GET /{code}`, `GET /links/{code}` and `DELETE /links/{code}` for an unknown code return `404 { "error": "not_found" }`.
R9. After `DELETE /links/{code}`, the link behaves as unknown (R8).
R10. Links and click counts survive a service restart with the same `DATA_DIR`.
R11. 50 concurrent `GET /{code}` requests on one link result in `clicks` = 50.

## Constraints
- Persistence must live under `DATA_DIR`. No external services (no Postgres, Redis, etc.).
- Dependencies: as allowed by the arm profile.
- Performance (with `perf/load.js`, default profile): p95 < 50 ms, error rate 0%.

## Out of scope
Authentication, custom aliases, expiry, analytics beyond the click counter, a UI.

## Visible examples

```
POST /links {"url":"https://example.com/a"}
→ 201 {"code":"aZ3k9Qp","url":"https://example.com/a","createdAt":"2026-10-25T10:00:00.000Z","clicks":0}

GET /aZ3k9Qp
→ 302 Location: https://example.com/a

POST /links {"url":"ftp://example.com"}
→ 400 {"error":"invalid_url"}
```
