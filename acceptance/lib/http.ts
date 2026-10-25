export interface Res {
  status: number;
  headers: Headers;
  text: string;
  json: any;
}

async function wrap(r: Response): Promise<Res> {
  const text = await r.text();
  let json: any = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    /* not JSON */
  }
  return { status: r.status, headers: r.headers, text, json };
}

export function client(baseUrl: () => string) {
  const url = (p: string) => baseUrl() + p;
  return {
    /** POST JSON. Pass a string to send a raw body. */
    async post(path: string, body: unknown): Promise<Res> {
      return wrap(
        await fetch(url(path), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        }),
      );
    },
    async get(path: string): Promise<Res> {
      return wrap(await fetch(url(path), { redirect: "manual" }));
    },
    async head(path: string): Promise<Res> {
      return wrap(await fetch(url(path), { method: "HEAD", redirect: "manual" }));
    },
    async del(path: string): Promise<Res> {
      return wrap(await fetch(url(path), { method: "DELETE" }));
    },
  };
}

export type Client = ReturnType<typeof client>;

let n = 0;
/** Unique alias-safe suffix so tests never collide within one service. */
export function uid(prefix = "t"): string {
  n += 1;
  return `${prefix}${Date.now().toString(36)}${n}`;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function utcDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
