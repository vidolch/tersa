import { describe, expect, it } from "vitest";
import { app, ROUTERS } from "../lib/hono.ts";

async function get(router: string | undefined, setup: (a: any) => void, path: string) {
  const a = app(router);
  setup(a);
  const res = await a.request(path);
  return { status: res.status, text: await res.text() };
}
const files = (a: any) => a.get("/files/*path", (c: any) => c.text(c.req.param("path")));

describe("HN3 R1", () => {
  it("captures the rest of the path", async () => {
    expect(await get(undefined, files, "/files/a")).toEqual({ status: 200, text: "a" });
    expect(await get(undefined, files, "/files/a/b/c")).toEqual({ status: 200, text: "a/b/c" });
  });
});

describe("HN3 R2", () => {
  it("needs at least one more character", async () => {
    expect((await get(undefined, files, "/files")).status).toBe(404);
    expect((await get(undefined, files, "/files/")).status).toBe(404);
  });
});

describe("HN3 R3", () => {
  it("decodes the value", async () => {
    expect(await get(undefined, files, "/files/a%20b/c")).toEqual({ status: 200, text: "a b/c" });
  });
});

describe("HN3 R4", () => {
  it("combines with other params", async () => {
    const r = await get(undefined, (a) => a.get("/users/:id/files/*path", (c: any) => c.json(c.req.param())), "/users/7/files/x/y.txt");
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ id: "7", path: "x/y.txt" });
  });
});

describe("HN3 R5", () => {
  for (const name of Object.keys(ROUTERS)) {
    it(`works with ${name}`, async () => {
      expect(await get(name, files, "/files/a/b")).toEqual({ status: 200, text: "a/b" });
      expect((await get(name, files, "/files")).status).toBe(404);
      const both = await get(name, (a) => a.get("/u/:id/f/*rest", (c: any) => c.json(c.req.param())), "/u/1/f/p/q");
      expect(JSON.parse(both.text)).toEqual({ id: "1", rest: "p/q" });
    });
  }
});

describe("HN3 regression", () => {
  it("plain * still works", async () => {
    const r = await get(undefined, (a) => a.get("/static/*", (c: any) => c.text("static")), "/static/x/y");
    expect(r).toEqual({ status: 200, text: "static" });
  });
});
