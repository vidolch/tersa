/**
 * The agent phase on the pi coding agent (@earendil-works/pi-coding-agent) instead of Claude Code.
 *
 * Same prompt, model, effort, caps and sandbox as agent.ts; pi's own system prompt and its four
 * default tools (read, bash, edit, write). Nothing is discovered from disk: no extensions, skills,
 * prompt templates or context files (AGENTS.md), matching `settingSources: []` on the Claude side.
 *
 * pi's events are translated into the Claude Agent SDK message shapes that MetricsCollector,
 * the transcript, anatomy.ts and probe.ts already read (tool names mapped to Read/Bash/Edit/Write),
 * so every metric is computed the same way for both harnesses.
 *
 * An arm can add a pi extension (`piExtension` in agent.json: a module under arms/<arm>/ whose
 * default export is an extension factory); it runs inside pi and can rewrite tool results.
 */
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { buildPrompt, type AgentRunInput } from "./agent.ts";
import { paths } from "./config.ts";
import { MetricsCollector } from "./metrics.ts";

export function piVersion(): string {
  // The package exports no ./package.json and no "main"; read it from node_modules directly.
  const pkg = join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "@earendil-works", "pi-coding-agent", "package.json");
  return existsSync(pkg) ? JSON.parse(readFileSync(pkg, "utf8")).version : "unknown";
}

export const PI_TOOLS = ["read", "bash", "edit", "write"];
const TOOL_NAMES: Record<string, string> = { read: "Read", bash: "Bash", edit: "Edit", write: "Write" };

/** pi tool arguments → the Claude Code field names the metrics use. */
export function claudeShaped(name: string, args: any, workspace: string): { name: string; input: any } {
  const abs = (p: unknown) => (typeof p === "string" ? (isAbsolute(p) ? p : resolve(workspace, p)) : p);
  switch (name) {
    case "read":
      return { name: "Read", input: { file_path: abs(args?.path), offset: args?.offset, limit: args?.limit } };
    case "bash":
      return { name: "Bash", input: { command: args?.command, timeout: args?.timeout } };
    case "edit":
      return { name: "Edit", input: { file_path: abs(args?.path), edits: args?.edits } };
    case "write":
      return { name: "Write", input: { file_path: abs(args?.path), content: args?.content } };
    default:
      return { name: TOOL_NAMES[name] ?? name, input: args ?? {} };
  }
}

/** One completed pi assistant message → Claude-shaped stream events + assistant message. */
export function translateAssistant(m: any, id: string, workspace: string): any[] {
  const u = m.usage ?? {};
  const usage = {
    input_tokens: u.input ?? 0,
    cache_read_input_tokens: u.cacheRead ?? 0,
    cache_creation_input_tokens: u.cacheWrite ?? 0,
    output_tokens: u.output ?? 0,
  };
  const content = (m.content ?? []).map((b: any) => {
    if (b.type === "toolCall") {
      const s = claudeShaped(b.name, b.arguments, workspace);
      return { type: "tool_use", id: b.id, name: s.name, input: s.input };
    }
    if (b.type === "thinking") return { type: "thinking", thinking: b.thinking ?? "" };
    return { type: "text", text: b.text ?? "" };
  });
  return [
    { type: "stream_event", event: { type: "message_start", message: { id, usage: { ...usage, output_tokens: 1 } } } },
    { type: "stream_event", event: { type: "message_delta", usage: { output_tokens: usage.output_tokens } } },
    { type: "assistant", message: { id, role: "assistant", model: m.model, content, usage, stop_reason: m.stopReason } },
  ];
}

export function translateToolResult(m: any): any {
  return {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content ?? [], is_error: !!m.isError }],
    },
  };
}

export async function runPiAgent(input: AgentRunInput): Promise<MetricsCollector & { piVersion?: string }> {
  // Node's fetch ignores HTTPS_PROXY; the sandbox only lets the agent reach the provider through it.
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent());

  const { prompt, overheadChars } = await buildPrompt(input.suite, input.arm, input.task, input.armConfig, input.workspace);
  const metrics = new MetricsCollector();
  const transcript = createWriteStream(join(input.rawDir, "transcript.jsonl"));
  const emit = (msg: any) => {
    transcript.write(JSON.stringify(msg) + "\n");
    metrics.observe(msg);
  };

  const agentDir = mkdtempSync(join(tmpdir(), "pi-agent-"));
  mkdirSync(agentDir, { recursive: true });
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  await modelRuntime.setRuntimeApiKey("anthropic", key);
  const model = modelRuntime.getModel("anthropic", input.model);
  if (!model) throw new Error(`pi has no model anthropic/${input.model}`);

  const extensionFactories: any[] = [];
  if (input.armConfig.piExtension) {
    const mod = await import(pathToFileURL(join(paths.arm(input.arm), input.armConfig.piExtension)).href);
    extensionFactories.push((pi: any) => mod.default(pi, { workspace: input.workspace, rawDir: input.rawDir, metrics }));
  }
  const resourceLoader = new DefaultResourceLoader({
    cwd: input.workspace,
    agentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: input.workspace,
    agentDir,
    model,
    modelRuntime,
    // effort=low|medium|… maps to pi's thinking level of the same name (Anthropic adaptive thinking + effort).
    ...(input.modelOptions?.effort ? { thinkingLevel: input.modelOptions.effort as any } : {}),
    resourceLoader,
    tools: PI_TOOLS,
    sessionManager: SessionManager.inMemory(input.workspace),
    settingsManager: SettingsManager.inMemory({ retry: { enabled: true, maxRetries: 6 } } as any),
  });
  transcript.write(JSON.stringify({ type: "harness", event: "pi_system_prompt", chars: session.systemPrompt.length }) + "\n");

  const started = Date.now();
  let turns = 0;
  let costUsd = 0;
  let stop: string | null = null;
  const totals = { inputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 0 };
  const abort = (reason: string) => {
    if (stop) return;
    stop = reason;
    void session.abort();
  };
  const timer = setTimeout(() => abort("error_wall_timeout"), input.maxMinutes * 60_000);

  const unsubscribe = session.subscribe((event: any) => {
    if (event.type === "auto_retry_start") {
      emit({ type: "system", subtype: "api_retry", attempt: event.attempt, max_retries: event.maxAttempts, retry_delay_ms: event.delayMs ?? 0 });
      console.log(`[retry] ${event.errorMessage ?? ""}`.slice(0, 200));
      return;
    }
    if (event.type !== "message_end") return;
    const m = event.message;
    if (m?.role === "assistant") {
      turns += 1;
      const id = m.responseId ?? `pi-${turns}`;
      for (const msg of translateAssistant(m, id, input.workspace)) emit(msg);
      const u = m.usage ?? {};
      totals.inputTokens += u.input ?? 0;
      totals.cacheReadInputTokens += u.cacheRead ?? 0;
      totals.cacheCreationInputTokens += u.cacheWrite ?? 0;
      totals.outputTokens += u.output ?? 0;
      costUsd += u.cost?.total ?? 0;
      if (m.stopReason === "error") {
        transcript.write(JSON.stringify({ type: "harness", event: "assistant_error", message: m.errorMessage }) + "\n");
      }
      const live = input.prices ? metrics.liveCost(input.prices) : costUsd;
      console.log(`[turn ${turns} ${Math.round((Date.now() - started) / 1000)}s] in ${Math.round((u.input + u.cacheRead + u.cacheWrite) / 1000)}k out ${u.output} $${live.toFixed(4)} | ${metrics.recentCalls.at(-1)?.slice(0, 100) ?? ""}`);
      if (turns >= input.maxTurns) abort("error_max_turns");
      if (live > input.maxBudgetUsd) abort("error_max_budget_usd");
    } else if (m?.role === "toolResult") {
      emit(translateToolResult(m));
    }
  });

  let crash: string | null = null;
  try {
    await session.prompt(prompt);
    await session.waitForIdle?.();
  } catch (err) {
    if (!stop) crash = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
  } finally {
    clearTimeout(timer);
    unsubscribe();
  }
  const last = [...(session.messages as any[])].reverse().find((m) => m.role === "assistant");
  if (!stop && !crash && last?.stopReason === "error") crash = String(last.errorMessage ?? "assistant error").slice(0, 2000);
  if (crash) {
    metrics.crash = crash;
    transcript.write(JSON.stringify({ type: "harness", event: "agent_crash", message: crash }) + "\n");
    console.error(`agent crashed: ${crash.slice(0, 500)}`);
  }
  const subtype = stop ?? (crash ? "error_agent_crash" : "success");
  emit({
    type: "result",
    subtype,
    num_turns: turns,
    duration_ms: Date.now() - started,
    total_cost_usd: costUsd,
    modelUsage: { [input.model]: totals },
  });
  if (stop === "error_wall_timeout") console.error(`agent stopped: wall-clock limit of ${input.maxMinutes} min reached after ${turns} turns`);
  if (stop === "error_max_turns") console.error(`agent stopped: turn limit reached`);
  session.dispose();
  transcript.end();
  metrics.finish(overheadChars);
  return Object.assign(metrics, { piVersion: piVersion() });
}
