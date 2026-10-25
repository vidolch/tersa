# Spec standard

Every task uses this template. Specs are **language-neutral**: they define behavior at the HTTP boundary only. Anything tech-specific (language, framework, commands) lives in `arms/<arm>/profile.md`.

```
# Task: <ID> <name>
Type: initial | feature | bugfix | refactor | unfamiliar-change
Start state: <reference snapshot or "empty scaffold">

## Goal
One or two sentences.

## Interface
Endpoints with request/response shapes.

## Rules
R1. <single testable behavior>
R2. ...

## Constraints
Allowed deps, persistence, performance limits.

## Out of scope
What must not change.

## Visible examples
1–3 request/response pairs.
```

## Conventions

1. **Every rule has an ID and ≥1 hidden test** in `acceptance/tests/<task>.test.ts`, under `describe("<task> R<n>")`. Results are reported per rule.
2. **Rules are additive across tasks.** Unless a task says otherwise, all rules from earlier tasks still hold and their tests still run (regression check).
3. **Bugfix tasks** describe the symptom and a reproduction, never the cause.
4. **Refactor tasks** pair a structural rule (checked by a per-arm script) with "all existing tests pass".
5. **Specs are frozen before the first run.** Any change after results exist creates a new task ID.
6. **Same bytes in every arm.** Only tooling and language differ.

## Service contract (applies to every task)

- Started by the arm's start command, listens on `PORT` (env).
- Stores all state under `DATA_DIR` (env). A fresh, empty `DATA_DIR` means a fresh service.
- `GET /healthz` → `200` once ready to serve.
- Error bodies are JSON: `{ "error": "<code>" }` with the codes defined in each task.
- All JSON responses use `Content-Type: application/json`.
