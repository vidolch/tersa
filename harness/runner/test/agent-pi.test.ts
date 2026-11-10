import { test } from "node:test";
import assert from "node:assert/strict";
import { claudeShaped, translateAssistant, translateToolResult } from "../src/agent-pi.ts";
import { MetricsCollector } from "../src/metrics.ts";

test("pi tool calls map to Claude Code names and fields", () => {
  assert.deepEqual(claudeShaped("read", { path: "src/a.ts", offset: 10, limit: 5 }, "/ws"), {
    name: "Read",
    input: { file_path: "/ws/src/a.ts", offset: 10, limit: 5 },
  });
  assert.equal(claudeShaped("bash", { command: "ls" }, "/ws").input.command, "ls");
  assert.equal(claudeShaped("edit", { path: "/abs/x.ts", edits: [] }, "/ws").input.file_path, "/abs/x.ts");
});

test("translated pi messages feed MetricsCollector like Claude Code messages", () => {
  const m = new MetricsCollector();
  const assistant = {
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [
      { type: "thinking", thinking: "" },
      { type: "toolCall", id: "c1", name: "read", arguments: { path: "src/a.ts" } },
      { type: "toolCall", id: "c2", name: "bash", arguments: { command: "sed -i 's/a/b/' src/a.ts" } },
    ],
    usage: { input: 10, output: 50, cacheRead: 1000, cacheWrite: 200 },
    stopReason: "toolUse",
  };
  for (const msg of translateAssistant(assistant, "r1", "/ws")) m.observe(msg);
  m.observe(translateToolResult({ toolCallId: "c1", content: [{ type: "text", text: "x".repeat(400) }], isError: false }));
  m.observe(translateToolResult({ toolCallId: "c2", content: [{ type: "text", text: "" }], isError: false }));
  m.observe({ type: "result", subtype: "success", num_turns: 1, duration_ms: 5, total_cost_usd: 0.001, modelUsage: { h: { inputTokens: 10, cacheReadInputTokens: 1000, cacheCreationInputTokens: 200, outputTokens: 50 } } });
  m.finish(0);
  assert.equal(m.m.toolCalls, 2);
  assert.equal(m.m.toolCallsByName.Read, 1);
  assert.equal(m.m.turnsToFirstEdit, 1); // sed -i counts as an edit
  assert.equal(m.reads["/ws/src/a.ts"], 400);
  assert.deepEqual(m.liveTokens(), { input: 1210, output: 50 });
  assert.equal(m.usage.cacheRead, 1000);
});
