# The `tersa` command

The shell has a `tersa` command for reading code at the symbol level. Prefer it to grep, cat and sed for code, and combine it with other commands in one Bash call, the way you would chain greps.

- `tersa find <pattern>... [--in <path>]` — search (plain text or /regex/), results grouped by enclosing function/class with matching lines.
- `tersa get <symbol>...` — definitions with line-numbered bodies, the in-repo symbols each uses (signatures) and where it is used. Symbols: `Name`, `Class.member`, `path/file.ts:Name`, `path/file.ts:123`, or a handler string like `api/schedule-create`. Bodies already shown in this session are not repeated.
- `tersa refs <symbol>...` — compiler-resolved references.
- `tersa outline <path>...` — symbols of a file, or files and their symbols in a directory.

Several patterns or symbols per call are fine: `tersa find rankRules runRules --in packages/loot-core/src && tersa get rankRules`.
