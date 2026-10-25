# Arm C: Tersa language + query layer

| Field | Value |
|---|---|
| Language | Tersa, transpiled to TypeScript |
| Runtime | Node 22.18+ (same as A and B) |
| Start command | `npm start` (transpile, then run; must honor `PORT`, `DATA_DIR`, `STORAGE`) |
| Allowed runtime deps | Node built-ins via typed host bindings |
| Agent tools | Standard tools + Tersa query layer + Tersa compiler queries |
| Agent context | `specs/<task>.md` + this profile + Tersa language skill (counted in cost) |
| Structural check | `checks/T4-structure.sh` (TODO: written against Tersa source, same rule as A/B) |

Status: blocked on the language prototype.
