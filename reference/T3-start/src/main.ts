import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseExpiry, validAlias, validUrl } from "./validate.ts";

const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.DATA_DIR ?? "./data";
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, "links.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS links (
    code TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    clicks INTEGER NOT NULL DEFAULT 0
  );
`);

function getLink(code: string) {
  const r = db.prepare("SELECT * FROM links WHERE code = ?").get(code) as any;
  return r
    ? { code: r.code, url: r.url, createdAt: r.created_at, expiresAt: r.expires_at, clicks: r.clicks }
    : null;
}

function send(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) return void res.writeHead(status).end();
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}
const fail = (res: ServerResponse, status: number, error: string) => send(res, status, { error });

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function createLink(req: IncomingMessage, res: ServerResponse) {
  let body: any;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return fail(res, 400, "invalid_json");
  }
  const input = body !== null && typeof body === "object" ? body : {};
  const now = Date.now();
  if (!validUrl(input.url)) return fail(res, 400, "invalid_url");
  const hasAlias = input.alias !== undefined;
  if (hasAlias && !validAlias(input.alias)) return fail(res, 400, "invalid_alias");
  let expiresAt: string | null = null;
  if (input.expiresAt !== undefined) {
    expiresAt = parseExpiry(input.expiresAt, now);
    if (expiresAt === null) return fail(res, 400, "invalid_expiry");
  }
  const insert = db.prepare(
    "INSERT OR IGNORE INTO links (code, url, created_at, expires_at) VALUES (?, ?, ?, ?)",
  );
  const createdAt = new Date(now).toISOString();
  if (hasAlias) {
    if (insert.run(input.alias, input.url, createdAt, expiresAt).changes !== 1) {
      return fail(res, 409, "alias_taken");
    }
    return send(res, 201, getLink(input.alias));
  }
  for (;;) {
    const code = Array.from({ length: 7 }, () => ALNUM[randomInt(ALNUM.length)]).join("");
    if (insert.run(code, input.url, createdAt, expiresAt).changes === 1) {
      return send(res, 201, getLink(code));
    }
  }
}

function redirect(code: string, isHead: boolean, res: ServerResponse) {
  const link = getLink(code);
  if (!link) return isHead ? send(res, 404) : fail(res, 404, "not_found");
  db.prepare("UPDATE links SET clicks = clicks + 1 WHERE code = ?").run(code);
  if (link.expiresAt && Date.now() >= Date.parse(link.expiresAt)) {
    return isHead ? send(res, 410) : fail(res, 410, "expired");
  }
  res.writeHead(302, { location: link.url }).end();
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const m = req.method ?? "GET";

    if (m === "GET" && url.pathname === "/healthz") return send(res, 200, { ok: true });
    if (m === "POST" && url.pathname === "/links") return await createLink(req, res);
    if (parts[0] === "links" && parts.length === 2) {
      if (m === "GET") {
        const l = getLink(parts[1]);
        return l ? send(res, 200, l) : fail(res, 404, "not_found");
      }
      if (m === "DELETE") {
        const n = db.prepare("DELETE FROM links WHERE code = ?").run(parts[1]).changes;
        return n === 1 ? send(res, 204) : fail(res, 404, "not_found");
      }
    }
    if (parts.length === 1 && (m === "GET" || m === "HEAD")) {
      return redirect(parts[0], m === "HEAD", res);
    }
    fail(res, 404, "not_found");
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(res, 500, "internal");
  }
});
server.listen(port, "127.0.0.1");

const shutdown = () => {
  server.close(() => (db.close(), process.exit(0)));
  server.closeAllConnections();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
