// Drives the Actual Budget workspace under test through its public Node API
// (@actual-app/api), built from the workspace itself. Black-box: the tests use
// only the API package, never loot-core internals.
//
// Env: ACTUAL_ROOT = the workspace (repo root) with packages/api/dist built.
import { cpSync, mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.env.ACTUAL_ROOT;
if (!ROOT) throw new Error("ACTUAL_ROOT is not set");

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const api: any = require(join(ROOT, "packages/api/dist/index.js"));

const TEMPLATE = join(ROOT, "packages/loot-core/src/mocks/files/default-budget-template");

/** Fresh copy of the default budget template, loaded. Call api.shutdown() after. */
export async function openFreshBudget(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), "actual-acc-"));
  mkdirSync(join(dataDir, "acc"));
  cpSync(TEMPLATE, join(dataDir, "acc"), { recursive: true });
  await api.init({ dataDir });
  await api.loadBudget("acc");
}

export async function category(name: string): Promise<{ id: string; name: string; group_id: string }> {
  const groups = await api.getCategoryGroups();
  const cats = groups.flatMap((g: any) => g.categories ?? []);
  const c = cats.find((c: any) => c.name.toLowerCase() === name.toLowerCase());
  if (!c) throw new Error(`no category ${name}; have ${cats.map((c: any) => c.name).join(", ")}`);
  return c;
}

export async function newAccount(name = "Checking", balance = 0): Promise<string> {
  return api.createAccount({ name, offbudget: false }, balance);
}
