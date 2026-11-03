# Code query tools

Besides the usual tools you have four code query tools (MCP server `tersa`). They answer questions about the code at the symbol level, so you need fewer file reads and fewer turns. **Batch:** every tool takes a list, so ask several things in one call.

- `code_get { symbols: [...] }` — definitions with line-numbered bodies, the in-repo symbols each one uses (as one-line signatures with locations), and where it is used. Names: `Name`, `Class.member`, `path/file.ts:Name`, `path/file.ts:123` (the symbol at that line), or a handler string such as `api/schedule-create` or `rule-add`. Bodies you already received are not repeated unless they changed.
- `code_find { patterns: [...], paths?: [...] }` — text or `/regex/` search, results grouped by enclosing function/class with the matching lines.
- `code_refs { symbols: [...] }` — compiler-resolved references to symbols.
- `code_outline { paths: [...] }` — signatures of every symbol in a file, or the files and top-level symbols of a directory.

Use them to locate and understand code; keep using Edit/Write to change files and Bash to run tests.
