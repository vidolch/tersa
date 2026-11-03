import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, category, newAccount, openFreshBudget } from "../lib/actual.ts";

let acct: string;
let food: string;

beforeEach(async () => {
  await openFreshBudget();
  acct = await newAccount("Checking");
  food = (await category("Food")).id;
});
afterEach(async () => {
  await api.shutdown();
});

const setFood = () => [{ op: "set", field: "category", value: food }];
async function createRule(conditions: unknown[]) {
  return api.createRule({ stage: null, conditionsOp: "and", conditions, actions: setFood() });
}

async function importRows(rows: { payee: string; notes?: string }[]) {
  await api.importTransactions(
    acct,
    rows.map((r, i) => ({ date: "2026-10-01", amount: -1000 - i, imported_payee: r.payee, notes: r.notes, imported_id: `id-${i}` })),
  );
  const txs = await api.getTransactions(acct, "2026-10-01", "2026-10-31");
  return Object.fromEntries(rows.map((r) => [r.payee, txs.find((t: any) => t.imported_payee === r.payee)?.category === food]));
}

describe("AB2 R1", () => {
  it("accepts `startsWith` on imported_payee and notes", async () => {
    for (const field of ["imported_payee", "notes"]) {
      const r = await createRule([{ op: "startsWith", field, value: "abc" }]);
      expect(r.id).toBeTruthy();
    }
  });

  it("rejects `startsWith` on non-string fields and with an empty value", async () => {
    await expect(createRule([{ op: "startsWith", field: "amount", value: 100 }])).rejects.toThrow();
    await expect(createRule([{ op: "startsWith", field: "date", value: "2026-10-01" }])).rejects.toThrow();
    await expect(createRule([{ op: "startsWith", field: "imported_payee", value: "" }])).rejects.toThrow();
  });
});

describe("AB2 R2", () => {
  it("matches the start of the imported payee, case-insensitively", async () => {
    await createRule([{ op: "startsWith", field: "imported_payee", value: "Lidl" }]);
    expect(await importRows([{ payee: "LIDL SOFIA" }, { payee: "lidl" }, { payee: "My Lidl" }, { payee: "Lid" }])).toEqual({
      "LIDL SOFIA": true,
      lidl: true,
      "My Lidl": false,
      Lid: false,
    });
  });
});

describe("AB2 R3", () => {
  it("matches the start of notes and never matches empty notes", async () => {
    await createRule([{ op: "startsWith", field: "notes", value: "groceries" }]);
    const got = await importRows([
      { payee: "A", notes: "Groceries for the week" },
      { payee: "B", notes: "weekly groceries" },
      { payee: "C" },
    ]);
    expect(got).toEqual({ A: true, B: false, C: false });
  });
});

describe("AB2 R4", () => {
  it("round-trips through getRules unchanged", async () => {
    const created = await createRule([{ op: "startsWith", field: "imported_payee", value: "Shell" }]);
    const rules = await api.getRules();
    const got = rules.find((r: any) => r.id === created.id);
    expect(got.conditions).toHaveLength(1);
    expect(got.conditions[0]).toMatchObject({ op: "startsWith", field: "imported_payee", value: "Shell" });
  });
});

describe("AB2 R5", () => {
  it("works in filters built from conditions (existing transactions)", async () => {
    await api.addTransactions(acct, [
      { date: "2026-10-02", amount: -100, notes: "Rent October" },
      { date: "2026-10-03", amount: -200, notes: "rent november" },
      { date: "2026-10-04", amount: -300, notes: "Not rent" },
    ]);
    const { filters } = await api.internal.send("make-filters-from-conditions", {
      conditions: [{ op: "startsWith", field: "notes", value: "rent" }],
    });
    const { data } = await api.aqlQuery(api.q("transactions").filter({ $and: filters }).select(["amount"]));
    expect(data.map((t: any) => t.amount).sort((a: number, b: number) => a - b)).toEqual([-200, -100]);
  });
});
