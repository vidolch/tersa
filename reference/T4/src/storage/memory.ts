import type { Link, LinkStore } from "./types.ts";

export function memoryStore(): LinkStore {
  const links = new Map<string, Link>();
  return {
    create(link) {
      if (links.has(link.code)) return false;
      links.set(link.code, { ...link, clicks: 0 });
      return true;
    },
    get(code) {
      const l = links.get(code);
      return l ? { ...l } : null;
    },
    delete(code) {
      return links.delete(code);
    },
    recordClick(code) {
      const l = links.get(code);
      if (l) l.clicks += 1;
    },
    close() {},
  };
}
