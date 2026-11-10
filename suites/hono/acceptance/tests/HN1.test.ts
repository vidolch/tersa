import { describe, expect, it } from "vitest";
import { app, ROUTERS } from "../lib/hono.ts";

async function order(router: string, setup: (a: any, log: string[]) => void, path: string) {
  const a = app(router);
  const log: string[] = [];
  setup(a, log);
  const res = await a.request(path);
  return { log, text: await res.text(), status: res.status };
}

const middlewareFirst = (a: any, log: string[]) => {
  a.use("*", async (_c: any, next: any) => { log.push("mw1"); await next(); });
  a.use("/a/*", async (_c: any, next: any) => { log.push("mw2"); await next(); });
  a.get("/a/b", (c: any) => { log.push("handler"); return c.text("b"); });
};
const firstWins = (a: any, log: string[]) => {
  a.get("/x/:id", (c: any) => { log.push("param"); return c.text("param"); });
  a.get("/x/1", (c: any) => { log.push("static"); return c.text("static"); });
  a.get("*", (c: any) => { log.push("star"); return c.text("star"); });
};

describe("HN1 R1", () => {
  it("TrieRouter runs middleware first, in registration order", async () => {
    const r = await order("TrieRouter", middlewareFirst, "/a/b");
    expect(r.log).toEqual(["mw1", "mw2", "handler"]);
    expect(r.text).toBe("b");
  });
});

describe("HN1 R2", () => {
  it("TrieRouter: the first registered matching handler answers", async () => {
    const r = await order("TrieRouter", firstWins, "/x/1");
    expect(r.text).toBe("param");
    expect(r.log).toEqual(["param"]);
  });
});

describe("HN1 R3", () => {
  for (const name of Object.keys(ROUTERS)) {
    it(`same order with ${name}`, async () => {
      expect((await order(name, middlewareFirst, "/a/b")).log).toEqual(["mw1", "mw2", "handler"]);
      // RegExpRouter alone rejects this route set as unsupported (that's when the default
      // router hands over to the trie router), so it's checked with the other routers only.
      if (name !== "RegExpRouter") expect((await order(name, firstWins, "/x/1")).text).toBe("param");
    });
  }
});
