# Task: HN4 Private Network Access in the CORS middleware
Type: feature
Start state: Hono at the suite's pinned commit

## Goal
Browsers send a CORS preflight with `Access-Control-Request-Private-Network: true` before a public site may call a server on a private network. Add an option to the `cors` middleware that answers it.

## Interface
`cors({ …, allowPrivateNetwork?: boolean })`, default `false`.

## Rules
R1. With `allowPrivateNetwork: true`, a preflight (`OPTIONS`) request carrying `Access-Control-Request-Private-Network: true` gets the response header `Access-Control-Allow-Private-Network: true`.
R2. Without the option, or with it `false`, the header is never sent.
R3. A preflight without `Access-Control-Request-Private-Network: true` does not get the header, even with the option on.
R4. Non-preflight responses never get the header.
R5. Everything else about preflight and simple CORS responses is unchanged.

## Constraints
- All existing tests must still pass.

## Out of scope
Other middleware. Private Network Access checks for non-CORS requests.

## Visible example
```
app.use('*', cors({ origin: 'https://app.example', allowPrivateNetwork: true }))
OPTIONS /api  with  Origin: https://app.example
                    Access-Control-Request-Method: GET
                    Access-Control-Request-Private-Network: true
→ 204, Access-Control-Allow-Private-Network: true
```
