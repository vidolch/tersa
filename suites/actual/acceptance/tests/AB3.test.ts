import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, newAccount, openFreshBudget } from "../lib/actual.ts";

const START = "2027-03-01";
const END = "2027-04-30";

let acct: string;
let ids: Record<string, string>;

const recur = (over: Record<string, unknown>) => ({
  start: "2027-01-01",
  interval: 1,
  frequency: "monthly",
  patterns: [],
  skipWeekend: false,
  weekendSolveMode: "after",
  endMode: "never",
  ...over,
});

async function schedule(name: string, date: unknown, extra: Record<string, unknown> = {}) {
  return api.createSchedule({
    name,
    posts_transaction: false,
    date,
    amount: -1000,
    amountOp: "is",
    account: acct,
    ...extra,
  });
}

beforeEach(async () => {
  await openFreshBudget();
  acct = await newAccount("Checking");
  const payee = await api.createPayee({ name: "Landlord" });
  ids = {
    // 31st, moved to the next Monday when on a weekend; months without a 31st are skipped
    rent: await schedule("Rent", recur({ start: "2027-01-31", skipWeekend: true, weekendSolveMode: "after" }), {
      payee,
      amount: -120000,
    }),
    // every Friday
    gym: await schedule("Gym", recur({ start: "2027-01-01", frequency: "weekly" }), {
      amount: { num1: -2000, num2: -3000 },
      amountOp: "isbetween",
    }),
    // daily, weekends moved to Friday: Fri/Sat/Sun collapse into one Friday entry
    coffee: await schedule("Coffee", recur({ start: "2027-03-01", frequency: "daily", skipWeekend: true, weekendSolveMode: "before" }), {
      amount: -350,
      amountOp: "isapprox",
    }),
    insurance: await schedule("Insurance", "2027-04-15"),
    oldBill: await schedule("Old bill", "2027-02-10"),
    alpha: await schedule("Alpha", "2027-04-15"),
  };
});
afterEach(async () => {
  await api.shutdown();
});

/** What the result must be, derived only from the existing public API. */
async function oracle(start: string, end: string) {
  const all = await api.getSchedules();
  const out: any[] = [];
  for (const s of all) {
    if (s.completed) continue;
    const dates: string[] = await api.getScheduleDates(s.date, { start, end });
    for (const date of dates) {
      out.push({
        scheduleId: s.id,
        name: s.name,
        date,
        amount: s.amount,
        amountOp: s.amountOp,
        payee: s.payee ?? null,
        account: s.account ?? null,
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || String(a.name).localeCompare(String(b.name)) || a.scheduleId.localeCompare(b.scheduleId),
  );
}

describe("AB3 R1", () => {
  it("lists every occurrence in the range, matching getScheduleDates", async () => {
    const got = await api.getUpcomingSchedules({ start: START, end: END });
    const want = await oracle(START, END);
    const key = (e: any) => `${e.scheduleId}@${e.date}`;
    expect(got.map(key).sort()).toEqual(want.map(key).sort());
    // weekend handling comes from the schedule settings, not plain calendar dates
    const rentDates = got.filter((e: any) => e.scheduleId === ids.rent).map((e: any) => e.date);
    expect(rentDates).toEqual(["2027-03-31"]); // April has no 31st
    const coffeeDates = got.filter((e: any) => e.scheduleId === ids.coffee).map((e: any) => e.date);
    expect(coffeeDates).not.toContain("2027-03-06");
    expect(new Set(coffeeDates).size).toBe(coffeeDates.length);
  });
});

describe("AB3 R2", () => {
  it("each entry carries the schedule's name, amount, amountOp, payee and account", async () => {
    const got = await api.getUpcomingSchedules({ start: START, end: END });
    const want = await oracle(START, END);
    const byKey = new Map(want.map((e: any) => [`${e.scheduleId}@${e.date}`, e]));
    for (const e of got) {
      expect(e).toEqual(byKey.get(`${e.scheduleId}@${e.date}`));
    }
  });
});

describe("AB3 R3", () => {
  it("is ordered by date, then name, then schedule id", async () => {
    const got = await api.getUpcomingSchedules({ start: START, end: END });
    expect(got).toEqual(await oracle(START, END));
    const apr15 = got.filter((e: any) => e.date === "2027-04-15").map((e: any) => e.name);
    expect(apr15.indexOf("Alpha")).toBeLessThan(apr15.indexOf("Insurance"));
  });
});

describe("AB3 R4", () => {
  it("excludes completed schedules and one-off dates outside the range", async () => {
    // setup only: mark completed the way the app's UI does
    await api.internal.send("schedule/update", { schedule: { id: ids.insurance, completed: true } });
    expect((await api.getSchedules()).find((s: any) => s.id === ids.insurance).completed).toBe(true);
    const got = await api.getUpcomingSchedules({ start: START, end: END });
    expect(got.some((e: any) => e.scheduleId === ids.insurance)).toBe(false);
    expect(got.some((e: any) => e.scheduleId === ids.oldBill)).toBe(false);
    expect(got.some((e: any) => e.scheduleId === ids.alpha)).toBe(true);
  });
});

describe("AB3 R5", () => {
  it("validates the range", async () => {
    await expect(api.getUpcomingSchedules({ start: START })).rejects.toThrow();
    await expect(api.getUpcomingSchedules({ end: END })).rejects.toThrow();
    await expect(api.getUpcomingSchedules({ start: "2027-3-1", end: END })).rejects.toThrow();
    await expect(api.getUpcomingSchedules({ start: END, end: START })).rejects.toThrow();
    await expect(api.getUpcomingSchedules({ start: "2027-01-01", end: "2028-01-03" })).rejects.toThrow();
    await expect(api.getUpcomingSchedules({ start: "2027-01-01", end: "2028-01-01" })).resolves.toBeInstanceOf(Array);
  });
});

describe("AB3 R6", () => {
  it("a single-day range works and returns only that day", async () => {
    const got = await api.getUpcomingSchedules({ start: "2027-04-15", end: "2027-04-15" });
    expect(got.every((e: any) => e.date === "2027-04-15")).toBe(true);
    expect(got.map((e: any) => e.name)).toEqual(expect.arrayContaining(["Alpha", "Insurance"]));
  });
});
