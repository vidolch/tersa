// Starts the service under test as a black box.
//
// Inputs (env):
//   SERVICE_DIR   directory of the implementation under test (required)
//   START_CMD     shell command that starts it (default: "npm start")
//   STORAGE_MODE  forwarded to the service as STORAGE (T4+), e.g. "memory"
//
// The service receives PORT and DATA_DIR and must answer GET /healthz with 200.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Service {
  baseUrl: string;
  dataDir: string;
  /** Stops the process, keeps DATA_DIR. */
  stop(): Promise<void>;
  /** Stops and starts again on the same DATA_DIR and env. */
  restart(): Promise<void>;
  /** Exit code if the process has exited, else null. */
  exitCode(): number | null;
}

export interface StartOptions {
  dataDir?: string;
  env?: Record<string, string | undefined>;
  /** Resolve once the process exits instead of waiting for /healthz. */
  expectExit?: boolean;
  timeoutMs?: number;
}

const SERVICE_DIR = process.env.SERVICE_DIR;
const START_CMD = process.env.START_CMD ?? "npm start";

export const storageMode = process.env.STORAGE_MODE || undefined;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else reject(new Error("no port"));
    });
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function startService(opts: StartOptions = {}): Promise<Service> {
  if (!SERVICE_DIR) throw new Error("SERVICE_DIR is not set");
  const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), "tersa-data-"));
  const timeoutMs = opts.timeoutMs ?? 15_000;

  let child: ChildProcess | null = null;
  let exited: number | null = null;
  let baseUrl = "";

  const launch = async () => {
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    exited = null;
    const env: Record<string, string | undefined> = {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      ...opts.env,
    };
    // Default storage means STORAGE is unset, not empty (spec T4).
    if (storageMode && !("STORAGE" in (opts.env ?? {}))) env.STORAGE = storageMode;
    else if (!("STORAGE" in (opts.env ?? {}))) delete env.STORAGE;
    // vitest sets NODE_ENV=test; don't leak test-runner env into the service.
    delete env.NODE_ENV;
    delete env.VITEST;
    child = spawn(START_CMD, {
      cwd: SERVICE_DIR,
      env: env as NodeJS.ProcessEnv,
      shell: true,
      detached: true,
      stdio: process.env.SERVICE_LOGS ? "inherit" : "ignore",
    });
    child.on("exit", (code) => {
      exited = code ?? 1;
    });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (exited !== null) {
        if (opts.expectExit) return;
        throw new Error(`service exited with code ${exited} before ready`);
      }
      if (!opts.expectExit) {
        try {
          const res = await fetch(`${baseUrl}/healthz`);
          if (res.status === 200) return;
        } catch {
          /* not up yet */
        }
      }
      await sleep(100);
    }
    if (opts.expectExit) throw new Error("service did not exit");
    throw new Error("service did not become healthy in time");
  };

  const stop = async () => {
    const c = child;
    if (!c || exited !== null) return;
    const done = new Promise<void>((r) => c.once("exit", () => r()));
    try {
      process.kill(-c.pid!, "SIGTERM");
    } catch {
      /* already gone */
    }
    const killTimer = setTimeout(() => {
      try {
        process.kill(-c.pid!, "SIGKILL");
      } catch {
        /* already gone */
      }
    }, 3_000);
    await done;
    clearTimeout(killTimer);
  };

  await launch();

  return {
    get baseUrl() {
      return baseUrl;
    },
    dataDir,
    stop,
    async restart() {
      await stop();
      await launch();
    },
    exitCode: () => exited,
  };
}
