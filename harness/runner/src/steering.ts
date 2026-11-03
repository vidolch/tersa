// Arm-level steering toward the query layer (arm B). A PreToolUse hook denies
// code-reading calls that the query tools cover and tells the agent the exact
// equivalent call. Read stays allowed: Claude Code requires a Read before an
// Edit, and the agent may still need a precise range.
//
// Contract (arms/<arm>/agent.json "steering.redirect": true):
//   Grep tool                                  → denied, suggest code_find
//   Glob tool for source files                 → denied, suggest code_outline
//   Bash grep/rg/ag/cat/sed/head/tail/nl/awk/less/find on source code → denied, suggest code_find/code_get/code_outline
//   everything else (tests, builds, git, package managers, non-source files) → allowed

const SOURCE = /\.(tsx?|jsx?|mts|cts|mjs|cjs)\b/;
const SOURCE_GLOB = /\*\*|\*\.(tsx?|jsx?|mts|cts|mjs|cjs)\b|\{[^}]*\b(ts|tsx|js|jsx)\b[^}]*\}/;
const CODE_DIR = /(^|[\s'"=/])(packages|src|lib|app|server|client|shared)(\/|\b)/;
const SEARCH_CMD = /(^|[|;&(]\s*|\bcd\s+\S+\s*&&\s*|\bxargs\s+)(grep|egrep|rg|ag|git\s+grep)\b/;
const VIEW_CMD = /(^|[|;&(]\s*|\bcd\s+\S+\s*&&\s*)(cat|sed|head|tail|nl|awk|less|more|bat)\b/;
const FIND_CMD = /(^|[|;&(]\s*|\bcd\s+\S+\s*&&\s*)find\s/;
// Commands whose output is not reading code, even if they mention source files.
const ALLOWED = /\b(vitest|jest|tsc|tsgo|node\s+--test|yarn|npm|npx|pnpm|git\s+(diff|status|log|add|commit|stash|show)|oxlint|eslint|prettier)\b/;

export interface Redirect {
  deny: boolean;
  reason?: string;
}

const q = (s: string) => JSON.stringify(s);

/** Best-effort extraction of the search pattern and paths from a grep-like command. */
function parseSearch(cmd: string): { pattern?: string; paths: string[] } {
  const seg = cmd.split(/[|;&]/).find((s) => SEARCH_CMD.test(s)) ?? cmd;
  const tokens = [...seg.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const i = tokens.findIndex((t) => /^(grep|egrep|rg|ag)$/.test(t) || t === "grep");
  const rest = tokens.slice(i + 1).filter((t) => !t.startsWith("-") && !/^\d+$/.test(t));
  const [pattern, ...paths] = rest;
  return { pattern, paths: paths.filter((p) => !p.includes("*")) };
}

function suggestFind(pattern: string | undefined, paths: string[]): string {
  const pat = pattern ? (/[\\^$.*+?()[\]{}|]/.test(pattern) ? `/${pattern}/` : pattern) : "<text or /regex/>";
  return `mcp__tersa__code_find ${JSON.stringify({ patterns: [pat], ...(paths.length ? { paths } : {}) })}`;
}

export function classify(toolName: string, input: any): Redirect {
  if (toolName === "Grep") {
    const pattern = typeof input?.pattern === "string" ? input.pattern : undefined;
    const path = typeof input?.path === "string" ? [input.path] : [];
    const glob = typeof input?.glob === "string" ? input.glob : "";
    if (glob && !SOURCE.test(glob) && !SOURCE_GLOB.test(glob)) return { deny: false }; // non-code files
    return {
      deny: true,
      reason: `In this setup code search goes through the query layer. Use ${suggestFind(pattern, path)} — results are grouped by enclosing function/class with line numbers, and you can pass several patterns in one call.`,
    };
  }

  if (toolName === "Glob") {
    const pattern = String(input?.pattern ?? "");
    const endsWithOtherType = /\.[a-z0-9]+$/i.test(pattern) && !SOURCE.test(pattern);
    if (endsWithOtherType || (!SOURCE.test(pattern) && !SOURCE_GLOB.test(pattern))) return { deny: false };
    const dir = (pattern.split(/[*{]/)[0] || ".").replace(/\/$/, "") || ".";
    return {
      deny: true,
      reason: `To explore code structure use mcp__tersa__code_outline ${JSON.stringify({ paths: [dir] })} (files and their symbols), or code_find to locate something by name.`,
    };
  }

  if (toolName === "Bash") {
    const cmd = String(input?.command ?? "");
    if (ALLOWED.test(cmd)) return { deny: false };
    const touchesCode = SOURCE.test(cmd) || CODE_DIR.test(cmd);
    if (SEARCH_CMD.test(cmd) && touchesCode) {
      const { pattern, paths } = parseSearch(cmd);
      return {
        deny: true,
        reason: `Code search goes through the query layer here. Use ${suggestFind(pattern, paths)} — grouped by enclosing symbol, several patterns per call. (Shell search is still fine for non-code files.)`,
      };
    }
    if (FIND_CMD.test(cmd) && touchesCode) {
      return {
        deny: true,
        reason: `To list code use mcp__tersa__code_outline {"paths": ["<dir>"]} (files with their symbols) or code_find to locate by name.`,
      };
    }
    if (VIEW_CMD.test(cmd) && SOURCE.test(cmd)) {
      const file = cmd.match(/([\w@.\-/]+\.(?:tsx?|jsx?|mts|cts|mjs|cjs))\b/)?.[1] ?? "<file>";
      const range = cmd.match(/(\d+),(\d+)p/);
      return {
        deny: true,
        reason:
          `Read code through the query layer: mcp__tersa__code_get {"symbols": ["${file}:<Name or line>"]} returns the whole symbol with line numbers, what it uses and its callers; ` +
          `mcp__tersa__code_outline {"paths": [${q(file)}]} lists the file's symbols. ` +
          `If you need exact lines before editing, use the Read tool${range ? ` (offset ${range[1]}, limit ${Number(range[2]) - Number(range[1]) + 1})` : ""}.`,
      };
    }
  }
  return { deny: false };
}

/** SDK hook config for the redirect, counting every redirect in `counter`. */
export function redirectHooks(counter: { redirects: number; byTool: Record<string, number> }) {
  return {
    PreToolUse: [
      {
        matcher: "Bash|Grep|Glob",
        hooks: [
          async (input: any) => {
            const r = classify(input.tool_name, input.tool_input);
            if (!r.deny) return { continue: true };
            counter.redirects += 1;
            counter.byTool[input.tool_name] = (counter.byTool[input.tool_name] ?? 0) + 1;
            return {
              hookSpecificOutput: {
                hookEventName: "PreToolUse" as const,
                permissionDecision: "deny" as const,
                permissionDecisionReason: r.reason,
              },
            };
          },
        ],
      },
    ],
  };
}
