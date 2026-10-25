import { randomInt } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parseDays, parseExpiry, validAlias, validUrl } from "../domain/validate.ts";
import type { LinkStore } from "../storage/types.ts";

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const DAY_MS = 86_400_000;

const genCode = () => Array.from({ length: 7 }, () => ALNUM[randomInt(ALNUM.length)]).join("");
const utcDate = (t: number) => new Date(t).toISOString().slice(0, 10);

function send(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}
const fail = (res: ServerResponse, status: number, error: string) => send(res, status, { error });

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function createLink(store: LinkStore, req: IncomingMessage, res: ServerResponse) {
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

  const base = { url: input.url as string, createdAt: new Date(now).toISOString(), expiresAt };
  if (hasAlias) {
    if (!store.create({ code: input.alias, ...base })) return fail(res, 409, "alias_taken");
    return send(res, 201, store.get(input.alias));
  }
  for (;;) {
    const code = genCode();
    if (store.create({ code, ...base })) return send(res, 201, store.get(code));
  }
}

function redirect(store: LinkStore, code: string, isHead: boolean, res: ServerResponse) {
  const link = store.get(code);
  if (!link) return isHead ? send(res, 404) : fail(res, 404, "not_found");
  const now = Date.now();
  if (link.expiresAt && now >= Date.parse(link.expiresAt)) {
    return isHead ? send(res, 410) : fail(res, 410, "expired");
  }
  if (!isHead) store.recordClick(code, utcDate(now));
  res.writeHead(302, { location: link.url }).end();
}

function stats(store: LinkStore, code: string, daysParam: string | null, res: ServerResponse) {
  const link = store.get(code);
  if (!link) return fail(res, 404, "not_found");
  const days = parseDays(daysParam);
  if (days === null) return fail(res, 400, "invalid_days");
  const now = Date.now();
  const dates = Array.from({ length: days }, (_, i) => utcDate(now - (days - 1 - i) * DAY_MS));
  const counts = store.daily(code, dates[0], dates[dates.length - 1]);
  send(res, 200, {
    code,
    total: link.clicks,
    daily: dates.map((date) => ({ date, clicks: counts.get(date) ?? 0 })),
  });
}

export function startHttp(store: LinkStore, port: number) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      const m = req.method ?? "GET";

      if (m === "GET" && url.pathname === "/healthz") return send(res, 200, { ok: true });
      if (m === "POST" && url.pathname === "/links") return await createLink(store, req, res);
      if (parts[0] === "links" && parts.length === 2) {
        if (m === "GET") {
          const l = store.get(parts[1]);
          return l ? send(res, 200, l) : fail(res, 404, "not_found");
        }
        if (m === "DELETE") return store.delete(parts[1]) ? send(res, 204) : fail(res, 404, "not_found");
      }
      if (parts[0] === "links" && parts.length === 3 && parts[2] === "stats" && m === "GET") {
        return stats(store, parts[1], url.searchParams.get("days"), res);
      }
      if (parts.length === 1 && (m === "GET" || m === "HEAD")) {
        return redirect(store, parts[0], m === "HEAD", res);
      }
      fail(res, 404, "not_found");
    } catch (e) {
      console.error(e);
      if (!res.headersSent) fail(res, 500, "internal");
    }
  });
  server.listen(port, "127.0.0.1");
  return server;
}
