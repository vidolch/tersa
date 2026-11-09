// `tersa` command: the query tools from the shell, so they can be combined
// with other commands in one call (the way agents batch grep/sed).
//
//   tersa find <pattern>... [--in <path>]... [--limit N]
//   tersa get <symbol>... [--lines N] [--no-callers] [--no-deps]
//   tersa refs <symbol>... [--limit N]
//   tersa outline <path>... [--depth N]
//
// Talks to the daemon at $TERSA_SOCKET; without one it answers in-process
// (slow: builds the index for every call).
import { connect } from "node:net";
import { parseArgs } from "node:util";

const HELP = `usage:
  tersa find <pattern>... [--in <path>]... [--limit N]   search, grouped by enclosing symbol; /regex/flags allowed
  tersa get <symbol>... [--lines N] [--no-callers] [--no-deps]   definitions with line-numbered bodies, what they use, callers
  tersa refs <symbol>... [--limit N]                      compiler-resolved references
  tersa outline <path>... [--depth N]                     symbols of a file / files of a directory
symbols: Name, Class.member, path/file.ts:Name, path/file.ts:123, or a handler string like api/schedule-create`;

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  console.log(HELP);
  process.exit(cmd ? 0 : 2);
}

const { values, positionals } = parseArgs({
  args: rest,
  allowPositionals: true,
  options: {
    in: { type: "string", multiple: true },
    limit: { type: "string" },
    lines: { type: "string" },
    depth: { type: "string" },
    "no-callers": { type: "boolean" },
    "no-deps": { type: "boolean" },
  },
});
const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));

let req: { tool: string; args: any };
switch (cmd) {
  case "find":
    req = { tool: "find", args: { patterns: positionals, paths: values.in, limit: num(values.limit) } };
    break;
  case "get":
    req = {
      tool: "get",
      args: {
        symbols: positionals,
        maxLines: num(values.lines),
        callers: values["no-callers"] ? false : undefined,
        deps: values["no-deps"] ? "none" : undefined,
      },
    };
    break;
  case "refs":
    req = { tool: "refs", args: { symbols: positionals, limit: num(values.limit) } };
    break;
  case "outline":
    req = { tool: "outline", args: { paths: positionals, depth: num(values.depth) } };
    break;
  default:
    console.error(`unknown command: ${cmd}\n${HELP}`);
    process.exit(2);
}
if (!positionals.length) {
  console.error(`tersa ${cmd}: nothing to look up\n${HELP}`);
  process.exit(2);
}

const socket = process.env.TERSA_SOCKET;
if (socket) {
  const conn = connect(socket, () => conn.write(JSON.stringify(req) + "\n"));
  conn.setEncoding("utf8");
  conn.on("data", (d) => process.stdout.write(d));
  conn.on("error", (e) => {
    console.error(`tersa: daemon not reachable (${e.message})`);
    process.exit(1);
  });
} else {
  const { Engine } = await import("./engine.ts");
  const e = new Engine(process.cwd());
  const a = req.args;
  const out =
    req.tool === "get" ? e.get(a) : req.tool === "find" ? e.find(a) : req.tool === "refs" ? e.refsTool(a) : e.outline(a);
  process.stdout.write(out.endsWith("\n") ? out : out + "\n");
}
