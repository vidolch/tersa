const ALIAS = /^[A-Za-z0-9_-]{3,32}$/;
const RESERVED = new Set(["links", "healthz"]);
const ISO_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function validUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0 || v.length > 2048) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validAlias(v: unknown): v is string {
  return typeof v === "string" && ALIAS.test(v) && !RESERVED.has(v);
}

/** Returns the normalized ISO timestamp, or null if invalid or not in the future. */
export function parseExpiry(v: unknown, now: number): string | null {
  if (typeof v !== "string" || !ISO_TZ.test(v)) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t) || t <= now) return null;
  return new Date(t).toISOString();
}

