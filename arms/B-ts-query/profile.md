# Arm B: TypeScript + query layer

| Field | Value |
|---|---|
| Language | TypeScript (strict), run with Node 22 native type stripping |
| Runtime | Node 22.18+ |
| Start command | `npm start` (must honor `PORT`, `DATA_DIR`, `STORAGE`) |
| Test command (agent's own) | `npm test` |
| Allowed runtime deps | Node built-ins only (`node:http`, `node:sqlite`, `node:crypto`, …) |
| Allowed dev deps | `typescript`, `vitest`, `@types/node` |
| Agent tools | Standard tools + Tersa query layer (MCP server) |
| Agent context | `specs/<task>.md` + this profile + query-layer usage note (counted in cost) |
| Structural check | `checks/T4-structure.sh` |

Scaffold: `scaffold/` (empty `src/`, `package.json` with the start script, `tsconfig.json`).
