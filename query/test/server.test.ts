// The MCP server over stdio, as an agent harness sees it.
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = dirname(fileURLToPath(import.meta.url));

test("stdio server lists the four tools and answers a batched call", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(HERE, "../src/server.ts"), "--root", join(HERE, "fixture")],
    stderr: "ignore",
  });
  const client = new Client({ name: "test", version: "1" });
  await client.connect(transport);
  try {
    assert.equal(client.getServerVersion()?.name, "tersa");
    assert.equal(client.getServerVersion()?.version, "v1.1");
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(tools, ["code_find", "code_get", "code_outline", "code_refs"]);
    const res: any = await client.callTool({ name: "code_get", arguments: { symbols: ["add", "Counter.increment"] } });
    const text = res.content[0].text as string;
    assert.match(text, /### add · function/);
    assert.match(text, /### Counter\.increment · method/);
    const bad: any = await client.callTool({ name: "code_get", arguments: { symbols: [] } });
    assert.equal(bad.isError, true, "schema violations are tool errors, not crashes");
  } finally {
    await client.close();
  }
});
