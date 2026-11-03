#!/usr/bin/env node
// MCP server (stdio) exposing the query tools defined in CONTRACT.md.
// Usage: node src/server.ts --root <workspace>
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CONTRACT_VERSION, Engine } from "./engine.ts";

const { values } = parseArgs({ options: { root: { type: "string", default: process.cwd() } } });
const engine = new Engine(resolve(values.root!));

const server = new McpServer({ name: "tersa", version: CONTRACT_VERSION });

const text = (fn: () => string) => {
  try {
    return { content: [{ type: "text" as const, text: fn() }] };
  } catch (e) {
    return { content: [{ type: "text" as const, text: `error: ${(e as Error).message}` }], isError: true };
  }
};

server.registerTool(
  "code_get",
  {
    description:
      "Get definitions of symbols with line-numbered bodies, the in-repo symbols each one uses (as signatures), and where it is used. " +
      "Pass several symbols in one call. Names: `Name`, `Class.member`, `path/file.ts:Name`, `path/file.ts:123` (symbol at a line), " +
      "or a handler string like `api/schedule-create`. Bodies you already received in this session are not repeated.",
    inputSchema: {
      symbols: z.array(z.string()).min(1).max(20),
      deps: z.enum(["signatures", "none"]).optional(),
      callers: z.boolean().optional(),
      maxLines: z.number().int().positive().max(2000).optional(),
    },
  },
  async (args) => text(() => engine.get(args)),
);

server.registerTool(
  "code_find",
  {
    description:
      "Search source text and get results grouped by the enclosing symbol (function, method, class…) with matching lines. " +
      "Pass several patterns in one call. Plain strings are literal; use /regex/flags for a regular expression. Optional path prefixes restrict the search.",
    inputSchema: {
      patterns: z.array(z.string()).min(1).max(10),
      paths: z.array(z.string()).optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
  },
  async (args) => text(() => engine.find(args)),
);

server.registerTool(
  "code_refs",
  {
    description: "Compiler-resolved references to symbols, each with its enclosing symbol, location and source line. Pass several symbols in one call.",
    inputSchema: {
      symbols: z.array(z.string()).min(1).max(20),
      limit: z.number().int().positive().max(500).optional(),
    },
  },
  async (args) => text(() => engine.refsTool(args)),
);

server.registerTool(
  "code_outline",
  {
    description:
      "Structure without bodies. For a file: every symbol as one signature line with its line range. For a directory: files with their top-level symbol names. Pass several paths in one call.",
    inputSchema: {
      paths: z.array(z.string()).min(1).max(20),
      depth: z.number().int().positive().max(5).optional(),
    },
  },
  async (args) => text(() => engine.outline(args)),
);

await server.connect(new StdioServerTransport());
// Warm the TypeScript programs once the client is connected; tool calls that
// arrive meanwhile simply wait for the event loop.
setTimeout(() => {
  const t = Date.now();
  const warmed = engine.index.warm();
  process.stderr.write(`tersa-query: warmed ${warmed.join(", ")} in ${Date.now() - t}ms\n`);
}, 0);
