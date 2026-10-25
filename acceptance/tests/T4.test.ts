// T4 R1 and R2 are covered by running T1–T3 with STORAGE_MODE unset and =memory
// (see run.sh). T4 R5 is checked by arms/<arm>/checks/T4-structure.sh.
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { client } from "../lib/http.js";
import { startService } from "../lib/service.js";

describe("T4 R3", () => {
  it("STORAGE=memory writes nothing under DATA_DIR", async () => {
    const svc = await startService({ env: { STORAGE: "memory" } });
    try {
      const api = client(() => svc.baseUrl);
      const r = await api.post("/links", { url: "https://example.com/m" });
      expect(r.status).toBe(201);
      await api.get(`/${r.json.code}`);
    } finally {
      await svc.stop();
    }
    expect(readdirSync(svc.dataDir)).toEqual([]);
  });
});

describe("T4 R4", () => {
  it("unknown STORAGE value exits non-zero before serving", async () => {
    const svc = await startService({ env: { STORAGE: "postgres" }, expectExit: true });
    expect(svc.exitCode()).not.toBe(0);
    expect(svc.exitCode()).not.toBeNull();
  });
});

describe("T4 R1", () => {
  it("STORAGE=file behaves like the default", async () => {
    const svc = await startService({ env: { STORAGE: "file" } });
    try {
      const api = client(() => svc.baseUrl);
      const r = await api.post("/links", { url: "https://example.com/f" });
      await svc.restart();
      expect((await api.get(`/links/${r.json.code}`)).status).toBe(200);
    } finally {
      await svc.stop();
    }
  });
});
