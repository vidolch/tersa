import { describe, expect, it } from "vitest";
import { Hono, load_ } from "../lib/hono.ts";

const { cors } = await load_("middleware/cors/index.ts");

function server(opts: Record<string, unknown>) {
  const app = new Hono();
  app.use("*", cors({ origin: "https://app.example", ...opts }));
  app.get("/api", (c: any) => c.text("ok"));
  return app;
}
const preflight = (app: any, pna = true) =>
  app.request("/api", {
    method: "OPTIONS",
    headers: {
      Origin: "https://app.example",
      "Access-Control-Request-Method": "GET",
      ...(pna ? { "Access-Control-Request-Private-Network": "true" } : {}),
    },
  });
const H = "Access-Control-Allow-Private-Network";

describe("HN4 R1", () => {
  it("answers a private network preflight", async () => {
    const res = await preflight(server({ allowPrivateNetwork: true }));
    expect(res.status).toBe(204);
    expect(res.headers.get(H)).toBe("true");
  });
});

describe("HN4 R2", () => {
  it("is off by default and when false", async () => {
    expect((await preflight(server({}))).headers.get(H)).toBeNull();
    expect((await preflight(server({ allowPrivateNetwork: false }))).headers.get(H)).toBeNull();
  });
});

describe("HN4 R3", () => {
  it("needs the request header", async () => {
    expect((await preflight(server({ allowPrivateNetwork: true }), false)).headers.get(H)).toBeNull();
  });
});

describe("HN4 R4", () => {
  it("never on non-preflight responses", async () => {
    const res = await server({ allowPrivateNetwork: true }).request("/api", {
      headers: { Origin: "https://app.example", "Access-Control-Request-Private-Network": "true" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get(H)).toBeNull();
  });
});

describe("HN4 R5", () => {
  it("leaves other preflight headers unchanged", async () => {
    const res = await preflight(server({ allowPrivateNetwork: true, allowMethods: ["GET", "POST"], maxAge: 600 }));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET,POST");
    expect(res.headers.get("Access-Control-Max-Age")).toBe("600");
  });
});
