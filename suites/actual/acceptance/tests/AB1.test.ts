import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, category, newAccount, openFreshBudget } from "../lib/actual.ts";

let acct: string;
let food: string;
let general: string;
let bills: string;

beforeEach(async () => {
  await openFreshBudget();
  acct = await newAccount("Checking");
  food = (await category("Food")).id;
  general = (await category("General")).id;
  bills = (await category("Bills")).id;
});
afterEach(async () => {
  await api.shutdown();
});

type Cond = { op: string; field: string; value: unknown };
async function rule(conditions: Cond[], cat: string, stage: string | null = null) {
  await api.createRule({
    stage,
    conditionsOp: "and",
    conditions,
    actions: [{ op: "set", field: "category", value: cat }],
  });
}
const payee = (op: string, value: unknown): Cond => ({ op, field: "imported_payee", value });

/** Imports transactions and returns imported payee → category id. */
async function importAndCategorize(rows: { payee: string; amount?: number }[]): Promise<Record<string, string | null>> {
  await api.importTransactions(
    acct,
    rows.map((r, i) => ({ date: "2026-10-01", amount: r.amount ?? -1000 - i, imported_payee: r.payee, imported_id: `id-${i}` })),
  );
  const txs = await api.getTransactions(acct, "2026-10-01", "2026-10-31");
  return Object.fromEntries(rows.map((r) => [r.payee, txs.find((t: any) => t.imported_payee === r.payee)?.category ?? null]));
}

describe("AB1 R1", () => {
  it("an exact payee rule wins over a broader `contains` rule", async () => {
    await rule([payee("contains", "lidl")], general);
    await rule([payee("is", "lidl sofia")], food);
    const got = await importAndCategorize([{ payee: "LIDL SOFIA" }, { payee: "Lidl Plovdiv" }]);
    expect(got).toEqual({ "LIDL SOFIA": food, "Lidl Plovdiv": general });
  });
});

describe("AB1 R2", () => {
  it("the more specific rule wins regardless of creation order", async () => {
    await rule([payee("oneOf", ["billa", "kaufland"])], food);
    await rule([payee("contains", "a")], general);
    const got = await importAndCategorize([{ payee: "Billa" }, { payee: "Fantastico" }]);
    expect(got).toEqual({ Billa: food, Fantastico: general });
  });
});

describe("AB1 R3", () => {
  it("a rule with more exact conditions wins over one with fewer", async () => {
    await rule([payee("is", "metro")], food);
    await rule([payee("is", "metro"), { op: "is", field: "amount", value: -4999 }], bills);
    const got = await importAndCategorize([{ payee: "Metro", amount: -4999 }]);
    expect(got).toEqual({ Metro: bills });
  });
});

describe("AB1 R4", () => {
  it("a `post` stage rule is applied after all default-stage rules", async () => {
    await rule([payee("contains", "shell")], bills, "post");
    await rule([payee("is", "shell sofia")], food);
    const got = await importAndCategorize([{ payee: "Shell Sofia" }]);
    expect(got).toEqual({ "Shell Sofia": bills });
  });
});
