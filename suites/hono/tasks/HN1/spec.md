# Task: HN1 Handlers run in the wrong order with TrieRouter
Type: bug
Start state: Hono at the suite's pinned commit, with a regression

## Report
Apps created with `new Hono({ router: new TrieRouter() })` run their handlers in the wrong order when several routes match a request. Middleware registered with `app.use('*', …)` before a route runs only after the route's handler, and when two routes match, the later one answers instead of the first. The default router does the same for routes it hands over to the trie router internally. Apps on `RegExpRouter`, `PatternRouter` and `LinearRouter` behave correctly.

## Rules
R1. With `TrieRouter`, middleware registered before a route runs before that route's handler, and in registration order.
R2. With `TrieRouter`, when several handlers match the same request, they run in the order they were registered; the first one that returns a response answers.
R3. With the default router (`new Hono()`), the order is the same as with every other built-in router, for every route.

## Constraints
- Fix the cause, without changing correct behaviour.
- All existing tests must still pass.

## Out of scope
New routing features. Performance.

## Visible example
```
app.use('*', async (c, next) => { log.push('mw'); await next() })
app.get('/a', (c) => { log.push('handler'); return c.text('a') })
GET /a → log is ['mw', 'handler']   (today: ['handler', 'mw'] with TrieRouter)
```
