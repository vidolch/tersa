import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, sleep, uid } from "../lib/http.js";
import { startService, type Service } from "../lib/service.js";

let svc: Service;
const api = client(() => svc.baseUrl);
const URL = "https://example.com/t2";

beforeAll(async () => {
  svc = await startService();
});
afterAll(async () => {
  await svc?.stop();
});

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const rand = (len: number) =>
  Array.from({ length: len }, () => ALNUM[Math.floor(Math.random() * ALNUM.length)]).join("");
const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();

describe("T2 R1", () => {
  it("uses the alias as the code", async () => {
    const alias = uid("a");
    const r = await api.post("/links", { url: URL, alias });
    expect(r.status).toBe(201);
    expect(r.json.code).toBe(alias);
    const g = await api.get(`/${alias}`);
    expect(g.status).toBe(302);
    expect(g.headers.get("location")).toBe(URL);
  });
});

describe("T2 R2", () => {
  it.each(["ab", "a".repeat(33), "has space", "dot.dot", "slash/x", "émoji", "", 7, null])(
    "rejects alias %j",
    async (alias) => {
      const r = await api.post("/links", { url: URL, alias });
      expect(r.status).toBe(400);
      expect(r.json).toEqual({ error: "invalid_alias" });
    },
  );

  it.each([3, 32])("accepts a valid alias of length %i", async (len) => {
    const alias = rand(len - 2) + "-_";
    const r = await api.post("/links", { url: URL, alias });
    expect(r.status).toBe(201);
    expect(r.json.code).toBe(alias);
  });
});

describe("T2 R3", () => {
  it("treats aliases as case-sensitive", async () => {
    const base = uid("c");
    const lower = base.toLowerCase();
    const upper = base.toUpperCase();
    expect((await api.post("/links", { url: URL + "/l", alias: lower })).status).toBe(201);
    expect((await api.post("/links", { url: URL + "/u", alias: upper })).status).toBe(201);
    expect((await api.get(`/${lower}`)).headers.get("location")).toBe(URL + "/l");
    expect((await api.get(`/${upper}`)).headers.get("location")).toBe(URL + "/u");
  });
});

describe("T2 R4", () => {
  it("rejects an alias that is already taken", async () => {
    const alias = uid("d");
    expect((await api.post("/links", { url: URL, alias })).status).toBe(201);
    const r = await api.post("/links", { url: URL + "/other", alias });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: "alias_taken" });
  });

  it("rejects an alias equal to a generated code", async () => {
    const gen = (await api.post("/links", { url: URL })).json.code;
    const r = await api.post("/links", { url: URL, alias: gen });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: "alias_taken" });
  });
});

describe("T2 R5", () => {
  it.each(["links", "healthz"])("rejects reserved alias %s", async (alias) => {
    const r = await api.post("/links", { url: URL, alias });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: "invalid_alias" });
  });
});

describe("T2 R6", () => {
  it.each([
    ["past", new Date(Date.now() - 60_000).toISOString()],
    ["no timezone", "2099-01-01T00:00:00"],
    ["garbage", "tomorrow"],
    ["number", 4102444800000],
  ])("rejects expiresAt (%s)", async (_n, expiresAt) => {
    const r = await api.post("/links", { url: URL, expiresAt });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: "invalid_expiry" });
  });

  it("accepts a future expiresAt with offset", async () => {
    const r = await api.post("/links", { url: URL, expiresAt: "2099-01-01T02:00:00+02:00" });
    expect(r.status).toBe(201);
    expect(Date.parse(r.json.expiresAt)).toBe(Date.parse("2099-01-01T00:00:00Z"));
  });
});

describe("T2 R7", () => {
  it("returns expiresAt null when not set", async () => {
    const r = await api.post("/links", { url: URL });
    expect(r.json.expiresAt).toBeNull();
    expect((await api.get(`/links/${r.json.code}`)).json.expiresAt).toBeNull();
  });
});

describe("T2 R8 + R9", () => {
  it("expires the redirect but keeps metadata readable", async () => {
    const alias = uid("e");
    const c = await api.post("/links", { url: URL, alias, expiresAt: inSeconds(1.5) });
    expect(c.status).toBe(201);
    expect((await api.get(`/${alias}`)).status).toBe(302);
    await sleep(2000);
    const g = await api.get(`/${alias}`);
    expect(g.status).toBe(410);
    expect(g.json).toEqual({ error: "expired" });
    // R9
    const m = await api.get(`/links/${alias}`);
    expect(m.status).toBe(200);
    expect(m.json.code).toBe(alias);
  });
});

describe("T2 R10", () => {
  it("generated codes never take over an existing alias", async () => {
    // Aliases shaped exactly like generated codes, then many generated links.
    const aliases = new Map<string, string>();
    for (let i = 0; i < 200; i++) {
      const a = rand(7);
      const url = `${URL}/alias/${i}`;
      if ((await api.post("/links", { url, alias: a })).status === 201) aliases.set(a, url);
    }
    for (let i = 0; i < 500; i++) {
      const code = (await api.post("/links", { url: `${URL}/gen/${i}` })).json.code;
      expect(aliases.has(code)).toBe(false);
    }
    for (const [a, url] of aliases) {
      expect((await api.get(`/${a}`)).headers.get("location")).toBe(url);
    }
  });
});

describe("T2 R11", () => {
  it("applies validation order", async () => {
    const taken = uid("o");
    await api.post("/links", { url: URL, alias: taken });
    const cases: [unknown, string][] = [
      ["{bad", "invalid_json"],
      [{ url: "nope", alias: "x", expiresAt: "bad" }, "invalid_url"],
      [{ url: URL, alias: "x", expiresAt: "bad" }, "invalid_alias"],
      [{ url: URL, alias: taken, expiresAt: "bad" }, "invalid_expiry"],
      [{ url: URL, alias: taken, expiresAt: inSeconds(3600) }, "alias_taken"],
    ];
    for (const [body, error] of cases) {
      const r = await api.post("/links", body);
      expect(r.json).toEqual({ error });
    }
  });
});
