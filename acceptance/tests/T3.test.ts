import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, sleep, uid } from "../lib/http.js";
import { startService, type Service } from "../lib/service.js";

let svc: Service;
const api = client(() => svc.baseUrl);
const URL = "https://example.com/t3";

beforeAll(async () => {
  svc = await startService();
});
afterAll(async () => {
  await svc?.stop();
});

const clicks = async (code: string) => (await api.get(`/links/${code}`)).json.clicks as number;

describe("T3 R1", () => {
  it("HEAD mirrors GET status and Location with empty body", async () => {
    const alias = uid("h");
    await api.post("/links", { url: URL, alias });
    const h = await api.head(`/${alias}`);
    expect(h.status).toBe(302);
    expect(h.headers.get("location")).toBe(URL);
    expect(h.text).toBe("");
  });

  it("HEAD on unknown code returns 404", async () => {
    expect((await api.head("/zzzzzzz")).status).toBe(404);
  });

  it("HEAD on expired link returns 410", async () => {
    const alias = uid("hx");
    const expiresAt = new Date(Date.now() + 1000).toISOString();
    await api.post("/links", { url: URL, alias, expiresAt });
    await sleep(1500);
    expect((await api.head(`/${alias}`)).status).toBe(410);
  });
});

describe("T3 R2", () => {
  it("HEAD never changes clicks", async () => {
    const alias = uid("hc");
    await api.post("/links", { url: URL, alias });
    for (let i = 0; i < 3; i++) await api.head(`/${alias}`);
    expect(await clicks(alias)).toBe(0);
  });
});

describe("T3 R3", () => {
  it("410 responses never change clicks", async () => {
    const alias = uid("ec");
    const expiresAt = new Date(Date.now() + 1000).toISOString();
    await api.post("/links", { url: URL, alias, expiresAt });
    await api.get(`/${alias}`); // 302, counts
    await sleep(1500);
    for (let i = 0; i < 3; i++) expect((await api.get(`/${alias}`)).status).toBe(410);
    expect(await clicks(alias)).toBe(1);
  });
});

describe("T3 R4", () => {
  it("302 still increments by exactly 1", async () => {
    const alias = uid("ok");
    await api.post("/links", { url: URL, alias });
    await api.get(`/${alias}`);
    await api.head(`/${alias}`);
    await api.get(`/${alias}`);
    expect(await clicks(alias)).toBe(2);
  });
});
