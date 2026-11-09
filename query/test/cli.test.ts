// The `tersa` shell command against a running daemon (arm B2).
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../src");

test("daemon + CLI: batched lookups, session dedupe across calls, usage errors", async () => {
  const socket = join(mkdtempSync(join(tmpdir(), "tersa-")), "s.sock");
  const daemon = spawn(process.execPath, [join(SRC, "daemon.ts"), "--root", join(HERE, "fixture"), "--socket", socket], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  await new Promise<void>((resolve) => daemon.stdout!.on("data", (d) => String(d).includes("ready") && resolve()));
  const tersa = (...args: string[]) =>
    execFileSync(process.execPath, [join(SRC, "cli.ts"), ...args], { env: { ...process.env, TERSA_SOCKET: socket }, encoding: "utf8" });
  try {
    const found = tersa("find", "total(", "add(", "--in", "src");
    assert.match(found, /### "total\(" — 3 lines in 3 symbols/);
    assert.match(found, /### "add\(" — /);
    const first = tersa("get", "add", "Counter.increment", "--no-callers");
    assert.match(first, /### add · function · src\/lib\/math\.ts:1-4/);
    assert.match(first, /### Counter\.increment · method/);
    assert.match(tersa("get", "add", "--no-callers"), /unchanged since shown earlier/, "dedupe spans CLI calls");
    assert.match(tersa("outline", "src/app.ts"), /11-15 export function run\(\): number/);
    assert.throws(() => tersa("get"), /nothing to look up/);
    assert.throws(() => tersa("nope", "x"), /unknown command/);
  } finally {
    daemon.kill();
  }
});
