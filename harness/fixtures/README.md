# Fixtures

Deliberately varied solutions used only by `harness/validate.sh` to test the evaluator itself.

| Fixture | Task | Expected |
|---|---|---|
| `T4-nullish` | T4 | passes: reads `STORAGE ?? "file"`, so the harness must leave STORAGE unset in default mode |
| `T4-crash-default` | T4 | fails: file storage exits at startup; every rule checked under default storage (T1–T3, T4 R1) must be reported failed, not missing |
