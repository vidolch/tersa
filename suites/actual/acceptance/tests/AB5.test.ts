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
const between = (from: string, to: string) => ({ op: "isbetween", field: "date", value: { from, to } });

const DATES = ["2026-09-30", "2026-10-01", "2026-10-15", "2026-10-31", "2026-11-01"];

/** Imports one transaction per date; returns date -> whether the rule set its category. */
async function importDates(dates = DATES) {
  await api.importTransactions(
    acct,
    dates.map((date, i) => ({ date, amount: -1000 - i, imported_payee: `P${i}`, imported_id: `id-${i}` })),
  );
  const txs = await api.getTransactions(acct, "2026-01-01", "2026-12-31");
  return Object.fromEntries(dates.map((d) => [d, txs.find((t: any) => t.date === d)?.category === food]));
}

/** Adds one transaction per date (no rules), then queries them through make-filters-from-conditions. */
async function filterDates(conditions: unknown[], dates = DATES) {
  await api.addTransactions(
    acct,
    dates.map((date, i) => ({ date, amount: -1000 - i, notes: `n${i}` })),
  );
  const { filters } = await api.internal.send("make-filters-from-conditions", { conditions });
  const { data } = await api.aqlQuery(api.q("transactions").filter({ $and: filters }).select(["date"]));
  const got = new Set(data.map((t: any) => t.date));
  return Object.fromEntries(dates.map((d) => [d, got.has(d)]));
}

const OCTOBER = {
  "2026-09-30": false,
  "2026-10-01": true,
  "2026-10-15": true,
  "2026-10-31": true,
  "2026-11-01": false,
};

describe("AB5 R1", () => {
  it("accepts a date range", async () => {
    const r = await createRule([between("2026-10-01", "2026-10-31")]);
    expect(r.id).toBeTruthy();
  });

  it("rejects invalid date ranges", async () => {
    await expect(createRule([{ op: "isbetween", field: "date", value: "2026-10-01" }])).rejects.toThrow();
    await expect(createRule([{ op: "isbetween", field: "date", value: { from: "2026-10-01" } }])).rejects.toThrow();
    await expect(createRule([between("2026-10", "2026-11")])).rejects.toThrow();
    await expect(createRule([between("yesterday", "2026-10-31")])).rejects.toThrow();
  });
});

describe("AB5 R2", () => {
  it("matches dates in the range, both ends included", async () => {
    await createRule([between("2026-10-01", "2026-10-31")]);
    expect(await importDates()).toEqual(OCTOBER);
  });
});

describe("AB5 R3", () => {
  it("accepts the ends in either order", async () => {
    await createRule([between("2026-10-31", "2026-10-01")]);
    expect(await importDates()).toEqual(OCTOBER);
  });
});

describe("AB5 R4", () => {
  it("round-trips through getRules unchanged", async () => {
    const created = await createRule([between("2026-10-01", "2026-10-31")]);
    const rules = await api.getRules();
    const got = rules.find((r: any) => r.id === created.id);
    expect(got.conditions).toHaveLength(1);
    expect(got.conditions[0]).toMatchObject({ op: "isbetween", field: "date", value: { from: "2026-10-01", to: "2026-10-31" } });
  });
});

describe("AB5 R5", () => {
  it("works in filters built from conditions", async () => {
    expect(await filterDates([between("2026-10-01", "2026-10-31")])).toEqual(OCTOBER);
  });

  it("works in filters with the ends in either order", async () => {
    expect(await filterDates([between("2026-10-31", "2026-10-01")])).toEqual(OCTOBER);
  });
});

describe("AB5 regression", () => {
  it("amount isbetween still works", async () => {
    await createRule([{ op: "isbetween", field: "amount", value: { num1: -2000, num2: -1000 } }]);
    await api.importTransactions(acct, [
      { date: "2026-10-01", amount: -1500, imported_payee: "in", imported_id: "a" },
      { date: "2026-10-02", amount: -2500, imported_payee: "out", imported_id: "b" },
    ]);
    const txs = await api.getTransactions(acct, "2026-10-01", "2026-10-31");
    expect(txs.find((t: any) => t.imported_payee === "in")?.category).toBe(food);
    expect(txs.find((t: any) => t.imported_payee === "out")?.category).not.toBe(food);
  });
});
