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
  `);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO links (code, url, created_at, expires_at) VALUES (?, ?, ?, ?)",
  );
  const select = db.prepare("SELECT * FROM links WHERE code = ?");
  const del = db.prepare("DELETE FROM links WHERE code = ?");
  const bump = db.prepare("UPDATE links SET clicks = clicks + 1 WHERE code = ?");
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
      return del.run(code).changes === 1;
    },
    recordClick(code) {
      bump.run(code);
    },
    close() {
      db.close();
    },
  };
}
