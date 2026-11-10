/** Loads Hono from the workspace under test (HONO_ROOT), by its source. */
const root = process.env.HONO_ROOT;
if (!root) throw new Error("HONO_ROOT is not set");
const load = (p: string) => import(/* @vite-ignore */ `${root}/src/${p}`);

export const { Hono } = await load("hono.ts");
export const { RegExpRouter } = await load("router/reg-exp-router/index.ts");
export const { TrieRouter } = await load("router/trie-router/index.ts");
export const { PatternRouter } = await load("router/pattern-router/index.ts");
export const { LinearRouter } = await load("router/linear-router/index.ts");
export const { SmartRouter } = await load("router/smart-router/index.ts");

/** Every built-in router, plus the default (no router option). */
export const ROUTERS: Record<string, () => any> = {
  default: () => undefined,
  RegExpRouter: () => new RegExpRouter(),
  TrieRouter: () => new TrieRouter(),
  PatternRouter: () => new PatternRouter(),
  LinearRouter: () => new LinearRouter(),
};
export const app = (router?: string) => {
  const r = router ? ROUTERS[router]() : undefined;
  return r ? new Hono({ router: r }) : new Hono();
};
export const load_ = load;
