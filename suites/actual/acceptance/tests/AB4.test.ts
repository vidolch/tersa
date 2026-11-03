import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, category, newAccount, openFreshBudget } from "../lib/actual.ts";

// Envelope budgeting, two consecutive months. Amounts in cents.
const M1 = "2027-01";
const M2 = "2027-02";

let acct: string;
let income: string;

beforeEach(async () => {
  await openFreshBudget();
  acct = await newAccount("Checking");
  income = (await category("Income")).id;
  await api.addTransactions(acct, [{ date: `${M1}-01`, amount: 100000, category: income, notes: "salary" }]);
});
afterEach(async () => {
  await api.shutdown();
});

async function spend(cat: string, amount: number, day = "15") {
  await api.addTransactions(acct, [{ date: `${M1}-${day}`, amount: -amount, category: cat }]);
}
async function cat(month: string, id: string) {
  const m = await api.getBudgetMonth(month);
  return m.categoryGroups.flatMap((g: any) => g.categories).find((c: any) => c.id === id);
}

describe("AB4 R1", () => {
  it("overspending a category without rollover reduces next month's To Budget", async () => {
    const food = (await category("Food")).id;
    await api.setBudgetAmount(M1, food, 10000);
    await spend(food, 15000);
    const m1 = await api.getBudgetMonth(M1);
    const m2 = await api.getBudgetMonth(M2);
    expect(m2.lastMonthOverspent).toBe(-5000);
    expect(m2.toBudget).toBe(m1.toBudget - 5000);
  });
});

describe("AB4 R2", () => {
  it("a category without rollover starts the next month at zero after overspending", async () => {
    const food = (await category("Food")).id;
    await api.setBudgetAmount(M1, food, 10000);
    await spend(food, 15000);
    expect((await cat(M1, food)).balance).toBe(-5000);
    expect((await cat(M2, food)).balance).toBe(0);
  });
});

describe("AB4 R3", () => {
  it("rollover overspending stays in the category and is not deducted from To Budget", async () => {
    const general = (await category("General")).id;
    await api.setBudgetAmount(M1, general, 10000);
    await api.setBudgetCarryover(M1, general, true);
    await spend(general, 13000);
    const m1 = await api.getBudgetMonth(M1);
    const m2 = await api.getBudgetMonth(M2);
    expect((await cat(M2, general)).balance).toBe(-3000);
    expect(m2.lastMonthOverspent).toBe(0);
    expect(m2.toBudget).toBe(m1.toBudget);
  });
});

describe("AB4 R4", () => {
  it("mixed: only non-rollover overspending is deducted, each exactly once", async () => {
    const food = (await category("Food")).id;
    const general = (await category("General")).id;
    const before = (await api.getBudgetMonth(M1)).toBudget;
    await api.setBudgetAmount(M1, food, 10000);
    await api.setBudgetAmount(M1, general, 10000);
    await api.setBudgetCarryover(M1, general, true);
    await spend(food, 15000, "10");
    await spend(general, 13000, "20");
    const m1 = await api.getBudgetMonth(M1);
    const m2 = await api.getBudgetMonth(M2);
    expect(m1.toBudget).toBe(before - 20000); // overspending never touches the same month
    expect(m2.lastMonthOverspent).toBe(-5000);
    expect(m2.toBudget).toBe(m1.toBudget - 5000);
    expect((await cat(M2, food)).balance).toBe(0);
    expect((await cat(M2, general)).balance).toBe(-3000);
  });
});

describe("AB4 R5", () => {
  it("positive leftovers roll into next month with or without rollover", async () => {
    const food = (await category("Food")).id;
    const general = (await category("General")).id;
    await api.setBudgetAmount(M1, food, 10000);
    await api.setBudgetAmount(M1, general, 10000);
    await api.setBudgetCarryover(M1, general, true);
    await spend(food, 4000);
    await spend(general, 1000);
    const m2 = await api.getBudgetMonth(M2);
    expect((await cat(M2, food)).balance).toBe(6000);
    expect((await cat(M2, general)).balance).toBe(9000);
    expect(m2.lastMonthOverspent).toBe(0);
  });
});
