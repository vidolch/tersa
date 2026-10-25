import type { Link, LinkStore } from "./types.ts";

export function memoryStore(): LinkStore {
  const links = new Map<string, Link>();
  const days = new Map<string, Map<string, number>>();
  return {
    create(link) {
      if (links.has(link.code)) return false;
      links.set(link.code, { ...link, clicks: 0 });
      days.set(link.code, new Map());
      return true;
    },
    get(code) {
      const l = links.get(code);
      return l ? { ...l } : null;
    },
    delete(code) {
      days.delete(code);
      return links.delete(code);
    },
    recordClick(code, date) {
      const l = links.get(code);
      if (!l) return;
      l.clicks += 1;
      const d = days.get(code)!;
      d.set(date, (d.get(date) ?? 0) + 1);
    },
    daily(code, from, to) {
      const out = new Map<string, number>();
      for (const [date, n] of days.get(code) ?? []) if (date >= from && date <= to) out.set(date, n);
      return out;
    },
    close() {},
  };
}
