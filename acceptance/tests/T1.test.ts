import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client } from "../lib/http.js";
import { startService, storageMode, type Service } from "../lib/service.js";

let svc: Service;
const api = client(() => svc.baseUrl);

beforeAll(async () => {
  svc = await startService();
});
afterAll(async () => {
  await svc?.stop();
});

async function create(url = "https://example.com/a") {
  const r = await api.post("/links", { url });
  expect(r.status).toBe(201);
  return r.json as { code: string; url: string; createdAt: string; clicks: number };
}

describe("T1 R1", () => {
  it("creates a link for http and https URLs", async () => {
    for (const url of ["https://example.com/x?q=1#f", "http://example.com"]) {
      const r = await api.post("/links", { url });
      expect(r.status).toBe(201);
      expect(r.headers.get("content-type")).toMatch(/application\/json/);
      expect(r.json).toMatchObject({ url, clicks: 0 });
      expect(typeof r.json.code).toBe("string");
      const t = Date.parse(r.json.createdAt);
      expect(Number.isNaN(t)).toBe(false);
      expect(r.json.createdAt).toMatch(/Z$|[+-]00:00$/);
      expect(Math.abs(Date.now() - t)).toBeLessThan(60_000);
    }
  });
});

describe("T1 R2", () => {
  it("generates 7-char alphanumeric codes", async () => {
    for (let i = 0; i < 20; i++) {
      const { code } = await create();
      expect(code).toMatch(/^[A-Za-z0-9]{7}$/);
    }
  });
});

describe("T1 R3", () => {
  it("gives unique codes, also for the same URL", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) codes.add((await create("https://example.com/same")).code);
    expect(codes.size).toBe(100);
  });
});

describe("T1 R4", () => {
  const bad: unknown[] = [
    {},
    { url: 42 },
    { url: null },
    { url: "" },
    { url: "example.com" },
    { url: "/relative/path" },
    { url: "ftp://example.com" },
    { url: "javascript:alert(1)" },
    { url: "https://example.com/" + "a".repeat(2048) },
  ];
  it.each(bad.map((b) => [JSON.stringify(b).slice(0, 60), b]))("rejects %s", async (_n, body) => {
    const r = await api.post("/links", body);
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: "invalid_url" });
  });

  it("accepts a URL of exactly 2048 characters", async () => {
    const base = "https://example.com/";
    const url = base + "a".repeat(2048 - base.length);
    expect(url.length).toBe(2048);
    const r = await api.post("/links", { url });
    expect(r.status).toBe(201);
  });
});

describe("T1 R5", () => {
  it("rejects malformed JSON", async () => {
    const r = await api.post("/links", "{not json");
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: "invalid_json" });
  });
});

describe("T1 R6", () => {
  it("redirects with 302 to the stored URL", async () => {
    const url = "https://example.com/target?x=1&y=%20z";
    const { code } = await create(url);
    const r = await api.get(`/${code}`);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe(url);
  });
});

describe("T1 R7", () => {
  it("increments clicks by exactly 1 per redirect", async () => {
    const { code } = await create();
    for (let i = 0; i < 3; i++) await api.get(`/${code}`);
    const r = await api.get(`/links/${code}`);
    expect(r.status).toBe(200);
    expect(r.json.clicks).toBe(3);
  });

  it("does not count GET /links/{code} as a click", async () => {
    const { code } = await create();
    await api.get(`/links/${code}`);
    await api.get(`/links/${code}`);
    expect((await api.get(`/links/${code}`)).json.clicks).toBe(0);
  });
});

describe("T1 R8", () => {
  it("returns 404 not_found for unknown codes", async () => {
    for (const r of [
      await api.get("/zzzzzzz"),
      await api.get("/links/zzzzzzz"),
      await api.del("/links/zzzzzzz"),
    ]) {
      expect(r.status).toBe(404);
      expect(r.json).toEqual({ error: "not_found" });
    }
  });
});

describe("T1 R9", () => {
  it("treats deleted links as unknown", async () => {
    const { code } = await create();
    const d = await api.del(`/links/${code}`);
    expect(d.status).toBe(204);
    expect(d.text).toBe("");
    expect((await api.get(`/${code}`)).status).toBe(404);
    expect((await api.get(`/links/${code}`)).status).toBe(404);
    expect((await api.del(`/links/${code}`)).status).toBe(404);
  });
});

describe.skipIf(storageMode === "memory")("T1 R10", () => {
  it("keeps links and clicks across restart", async () => {
    const { code, url } = await create("https://example.com/persist");
    await api.get(`/${code}`);
    await api.get(`/${code}`);
    await svc.restart();
    const r = await api.get(`/links/${code}`);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ code, url, clicks: 2 });
    expect((await api.get(`/${code}`)).headers.get("location")).toBe(url);
  });
});

describe("T1 R11", () => {
  it("counts 50 concurrent redirects exactly", async () => {
    const { code } = await create();
    const rs = await Promise.all(Array.from({ length: 50 }, () => api.get(`/${code}`)));
    expect(rs.every((r) => r.status === 302)).toBe(true);
    expect((await api.get(`/links/${code}`)).json.clicks).toBe(50);
  });
});
