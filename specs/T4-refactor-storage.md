# Task: T4 Pluggable storage
Type: refactor
Start state: `reference/T3` (all T1–T3 rules pass)

## Goal
Isolate persistence behind a single storage boundary and add an in-memory implementation, selectable at startup. Observable behavior must not change.

## Interface
New environment variable `STORAGE`:
- unset or `file` → current persistent behavior under `DATA_DIR`
- `memory` → state kept in process memory only

No HTTP changes.

## Rules
R1. With `STORAGE` unset or `file`, all T1–T3 rules pass.
R2. With `STORAGE=memory`, all T1–T3 rules pass except T1 R10 (restart persistence).
R3. With `STORAGE=memory`, the service writes no files under `DATA_DIR`.
R4. `STORAGE` with any other value makes the service exit with a non-zero code before `/healthz` responds.
R5. (structural) All persistence code lives under `src/storage/`. No file outside `src/storage/` performs file-system or database access. Checked by `arms/<arm>/checks/T4-structure.sh`.

## Constraints
Same as T1. No new runtime dependencies.

## Out of scope
New storage backends beyond `file` and `memory`. Data migration.
