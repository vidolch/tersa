// Query daemon: keeps one Engine (index, language services, session dedupe)
// alive for a whole agent session and answers the `tersa` CLI over a unix
// socket. Protocol: the client sends one JSON line {tool, args}; the daemon
// replies with the rendered text and closes the connection.
//
// Usage: node src/daemon.ts --root <workspace> --socket <path>
// Prints "ready" on stdout once the index is built and the socket listens.
import { existsSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Engine } from "./engine.ts";

const { values } = parseArgs({ options: { root: { type: "string" }, socket: { type: "string" } } });
if (!values.root || !values.socket) {
  console.error("usage: daemon.ts --root <dir> --socket <path>");
  process.exit(2);
}
const engine = new Engine(resolve(values.root));

type Request = { tool: "get" | "find" | "refs" | "outline"; args: any };

function answer(req: Request): string {
  switch (req.tool) {
    case "get":
      return engine.get(req.args);
    case "find":
      return engine.find(req.args);
    case "refs":
      return engine.refsTool(req.args);
    case "outline":
      return engine.outline(req.args);
    default:
      return `error: unknown command ${(req as { tool: string }).tool}`;
  }
}

if (existsSync(values.socket)) unlinkSync(values.socket);
const server = createServer((conn) => {
  let buf = "";
  conn.on("data", (d) => {
    buf += d;
    const nl = buf.indexOf("\n");
    if (nl < 0) return;
    let out: string;
    try {
      out = answer(JSON.parse(buf.slice(0, nl)));
    } catch (e) {
      out = `error: ${(e as Error).message}`;
    }
    conn.end(out.endsWith("\n") ? out : out + "\n");
  });
  conn.on("error", () => {});
});
server.listen(values.socket, () => {
  process.stdout.write("ready\n");
  // Warm the TypeScript programs after reporting ready; requests wait on the event loop meanwhile.
  setTimeout(() => engine.index.warm(), 0);
});
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
