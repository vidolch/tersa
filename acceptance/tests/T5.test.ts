import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, sleep, uid, utcDate } from "../lib/http.js";
import { startService, storageMode, type Service } from "../lib/service.js";

let svc: Service;
const api = client(() => svc.baseUrl);
const URL = "https://example.com/t5";

beforeAll(async () => {
  svc = await startService();
});
afterAll(async () => {
  await svc?.stop();
});

async function link() {
  const alias = uid("s");
  expect((await api.post("/links", { url: URL, alias })).status).toBe(201);
  return alias;
}

function expectedDates(days: number): string[] {
  const now = Date.now();
  return Array.from({ length: days }, (_, i) => utcDate(new Date(now - (days - 1 - i) * 86_400_000)));
}

describe("T5 R1", () => {
  it("defaults to 7 days", async () => {
    const r = await api.get(`/links/${await link()}/stats`);
    expect(r.status).toBe(200);
    expect(r.json.daily).toHaveLength(7);
  });

  it.each(["0", "91", "-1", "1.5", "abc", ""])("rejects days=%s", async (d) => {
    const r = await api.get(`/links/${await link()}/stats?days=${d}`);
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: "invalid_days" });
  });

  it.each([1, 90])("accepts days=%i", async (d) => {
    const r = await api.get(`/links/${await link()}/stats?days=${d}`);
    expect(r.status).toBe(200);
    expect(r.json.daily).toHaveLength(d);
  });
});

describe("T5 R2", () => {
  it("lists consecutive UTC dates ending today, zero-filled", async () => {
    const r = await api.get(`/links/${await link()}/stats?days=10`);
    expect(r.json.daily.map((e: any) => e.date)).toEqual(expectedDates(10));
    expect(r.json.daily.every((e: any) => e.clicks === 0)).toBe(true);
  });
});

describe("T5 R3 + R4", () => {
  it("adds redirects to today's bucket and total matches clicks", async () => {
    const code = await link();
    for (let i = 0; i < 4; i++) await api.get(`/${code}`);
    await api.head(`/${code}`); // must not count (T3)
    const r = await api.get(`/links/${code}/stats?days=3`);
    expect(r.json.code).toBe(code);
    expect(r.json.daily.at(-1)).toEqual({ date: utcDate(), clicks: 4 });
    expect(r.json.total).toBe(4);
    expect(r.json.total).toBe((await api.get(`/links/${code}`)).json.clicks);
  });
});

describe("T5 R5", () => {
  it("404 for unknown code", async () => {
    const r = await api.get("/links/zzzzzzz/stats");
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ error: "not_found" });
  });

  it("200 for expired link", async () => {
    const alias = uid("sx");
    await api.post("/links", { url: URL, alias, expiresAt: new Date(Date.now() + 1000).toISOString() });
    await api.get(`/${alias}`);
    await sleep(1500);
    const r = await api.get(`/links/${alias}/stats`);
    expect(r.status).toBe(200);
    expect(r.json.total).toBe(1);
  });
});

describe.skipIf(storageMode === "memory")("T5 R6", () => {
  it("stats survive restart with file storage", async () => {
    const code = await link();
    await api.get(`/${code}`);
    await api.get(`/${code}`);
    await svc.restart();
    const r = await api.get(`/links/${code}/stats?days=1`);
    expect(r.json.daily).toEqual([{ date: utcDate(), clicks: 2 }]);
  });
});
