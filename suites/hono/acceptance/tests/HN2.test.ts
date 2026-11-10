import { describe, expect, it } from "vitest";
import { Hono, load_ } from "../lib/hono.ts";

const { languageDetector } = await load_("middleware/language/index.ts");
const { accepts } = await load_("helper/accepts/index.ts");

async function detect(header: string, supported: string[]) {
  const app = new Hono();
  app.use("*", languageDetector({ order: ["header"], supportedLanguages: supported, fallbackLanguage: supported[0], caches: false }));
  app.get("/", (c: any) => c.text(c.get("language")));
  const res = await app.request("/", { headers: { "Accept-Language": header } });
  return res.text();
}

describe("HN2 R1", () => {
  it("picks the highest quality, whatever the header order", async () => {
    expect(await detect("fr;q=0.5, en", ["en", "fr"])).toBe("en");
    expect(await detect("de;q=0.2, fr;q=0.8, en;q=0.5", ["en", "fr", "de"])).toBe("fr");
    expect(await detect("de, en;q=0.9", ["en", "de"])).toBe("de");
  });
});

describe("HN2 R2", () => {
  it("keeps header order for equal quality", async () => {
    expect(await detect("fr;q=0.3, de;q=0.7, en;q=0.7", ["en", "de", "fr"])).toBe("de");
  });
});

describe("HN2 R3", () => {
  it("the accepts helper ranks the same way", async () => {
    const app = new Hono();
    app.get("/", (c: any) =>
      c.text(accepts(c, { header: "Accept-Language", supports: ["en", "fr", "de"], default: "en" })),
    );
    const res = await app.request("/", { headers: { "Accept-Language": "de;q=0.2, fr;q=0.9, en;q=0.4" } });
    expect(await res.text()).toBe("fr");
    const app2 = new Hono();
    app2.get("/", (c: any) =>
      c.text(accepts(c, { header: "Accept", supports: ["text/html", "application/json"], default: "text/html" })),
    );
    const res2 = await app2.request("/", { headers: { Accept: "text/html;q=0.5, application/json" } });
    expect(await res2.text()).toBe("application/json");
  });
});
