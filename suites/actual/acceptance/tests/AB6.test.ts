import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, openFreshBudget } from "../lib/actual.ts";

beforeEach(async () => {
  await openFreshBudget();
});
afterEach(async () => {
  await api.shutdown();
});

async function groupWith(names: string[]) {
  const groupId = await api.createCategoryGroup({ name: `G ${Math.random()}` });
  const ids: Record<string, string> = {};
  for (const name of names) ids[name] = await api.createCategory({ name, group_id: groupId });
  return { groupId, ids };
}
async function order(groupId: string): Promise<string[]> {
  const groups = await api.getCategoryGroups();
  return groups.find((g: any) => g.id === groupId).categories.map((c: any) => c.name);
}
const move = (id: string, groupId: string, targetId: string | null) =>
  api.internal.send("category-move", { id, groupId, targetId });

describe("AB6 R1", () => {
  it("places the category directly before the target", async () => {
    const { groupId, ids } = await groupWith(["A", "B", "C", "D"]);
    const start = await order(groupId);
    await move(ids.D, groupId, ids.B);
    const expected = start.filter((n) => n !== "D");
    expected.splice(expected.indexOf("B"), 0, "D");
    expect(await order(groupId)).toEqual(expected);
    await move(ids[expected[expected.length - 1]], groupId, ids[expected[0]]);
    const exp2 = expected.slice(0, -1);
    exp2.unshift(expected[expected.length - 1]);
    expect(await order(groupId)).toEqual(exp2);
  });
});

describe("AB6 R2", () => {
  it("a null target places it last", async () => {
    const { groupId, ids } = await groupWith(["A", "B", "C"]);
    const start = await order(groupId);
    const first = start[0];
    await move(ids[first], groupId, null);
    expect(await order(groupId)).toEqual([...start.slice(1), first]);
  });
});

describe("AB6 R3", () => {
  it("sorts by name both ways", async () => {
    const { groupId } = await groupWith(["Rent", "Groceries", "Utilities", "Fuel", "Books"]);
    await api.internal.send("categories-sort", { groupId, direction: "asc" });
    expect(await order(groupId)).toEqual(["Books", "Fuel", "Groceries", "Rent", "Utilities"]);
    await api.internal.send("categories-sort", { groupId, direction: "desc" });
    expect(await order(groupId)).toEqual(["Utilities", "Rent", "Groceries", "Fuel", "Books"]);
  });
});
