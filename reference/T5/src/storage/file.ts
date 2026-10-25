import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Link, LinkStore } from "./types.ts";

export function fileStore(dataDir: string): LinkStore {
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
    CREATE TABLE IF NOT EXISTS clicks_daily (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      n INTEGER NOT NULL,
      PRIMARY KEY (code, date)
    );
  `);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO links (code, url, created_at, expires_at) VALUES (?, ?, ?, ?)",
  );
  const select = db.prepare("SELECT * FROM links WHERE code = ?");
  const del = db.prepare("DELETE FROM links WHERE code = ?");
  const delDaily = db.prepare("DELETE FROM clicks_daily WHERE code = ?");
  const bump = db.prepare("UPDATE links SET clicks = clicks + 1 WHERE code = ?");
  const bumpDay = db.prepare(
    `INSERT INTO clicks_daily (code, date, n) VALUES (?, ?, 1)
     ON CONFLICT (code, date) DO UPDATE SET n = n + 1`,
  );
  const range = db.prepare(
    "SELECT date, n FROM clicks_daily WHERE code = ? AND date BETWEEN ? AND ?",
  );

  return {
    create(l) {
      return insert.run(l.code, l.url, l.createdAt, l.expiresAt).changes === 1;
    },
    get(code) {
      const r = select.get(code) as any;
      return r
        ? { code: r.code, url: r.url, createdAt: r.created_at, expiresAt: r.expires_at, clicks: r.clicks }
        : null;
    },
    delete(code) {
      delDaily.run(code);
      return del.run(code).changes === 1;
    },
    recordClick(code, date) {
      db.exec("BEGIN");
      try {
        bump.run(code);
        bumpDay.run(code, date);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    daily(code, from, to) {
      const out = new Map<string, number>();
      for (const r of range.all(code, from, to) as any[]) out.set(r.date, r.n);
      return out;
    },
    close() {
      db.close();
    },
  };
}
