// Derives agent-behavior metrics from the SDK message stream.
// Heuristics are documented inline; they are applied identically to every arm.

export interface AgentMetrics {
  turns: number;
  toolCalls: number;
  toolCallsByName: Record<string, number>;
  fileReads: number;
  repeatReads: number;
  failedEdits: number;
  compileFailures: number;
  testRuns: number;
  compactions: number;
  wallMs: number;
  completed: boolean;
}

export interface Usage {
  inputUncached: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  /** Estimate: characters of tool_result content / 4. */
  toolResultTokens: number;
  /** Estimate: characters of arm context files / 4. */
  contextOverheadTokens: number;
}

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
// A Bash command counts as a compile step if it runs the type checker or a build.
const COMPILE_CMD = /\btsc\b|\btypecheck\b|npm run build|\btersa (build|check)\b/;
// A Bash command counts as a test run if it runs a test runner.
const TEST_CMD = /\bvitest\b|\bnpm (run )?test\b|\bnode --test\b|\bjest\b/;

const est = (chars: number) => Math.round(chars / 4);

function contentChars(content: unknown): number {
  if (typeof content === "string") return content.length;
  if (Array.isArray(content)) {
    return content.reduce(
      (n, b: any) => n + (typeof b?.text === "string" ? b.text.length : JSON.stringify(b ?? "").length),
      0,
    );
  }
  return 0;
}

export class MetricsCollector {
  private toolUses = new Map<string, { name: string; input: any }>();
  private readKeys = new Set<string>();
  private toolResultChars = 0;
  m: AgentMetrics = {
    turns: 0,
    toolCalls: 0,
    toolCallsByName: {},
    fileReads: 0,
    repeatReads: 0,
    failedEdits: 0,
    compileFailures: 0,
    testRuns: 0,
    compactions: 0,
    wallMs: 0,
    completed: false,
  };
  usage: Usage = {
    inputUncached: 0,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
    toolResultTokens: 0,
    contextOverheadTokens: 0,
  };
  costUsd = 0;
  resultSubtype: string | null = null;
  /** Latest usage per API message id, for a running cost estimate. */
  private liveUsage = new Map<string, { i: number; r: number; w: number; o: number }>();

  /** Running cost from per-message usage at the given prices (USD per 1M tokens). */
  liveCost(p: { inputMiss: number; inputHit: number; output: number }): number {
    let c = 0;
    for (const u of this.liveUsage.values()) c += ((u.i + u.w) * p.inputMiss + u.r * p.inputHit + u.o * p.output) / 1e6;
    return c;
  }

  /** Feed every message from the SDK stream. Subagent messages are counted too. */
  observe(msg: any): void {
    switch (msg.type) {
      case "assistant": {
        const id = msg.message?.id;
        const u = msg.message?.usage;
        if (id && u) {
          const prev = this.liveUsage.get(id) ?? { i: 0, r: 0, w: 0, o: 0 };
          this.liveUsage.set(id, {
            i: Math.max(prev.i, u.input_tokens ?? 0),
            r: Math.max(prev.r, u.cache_read_input_tokens ?? 0),
            w: Math.max(prev.w, u.cache_creation_input_tokens ?? 0),
            o: Math.max(prev.o, u.output_tokens ?? 0),
          });
        }
        for (const b of msg.message?.content ?? []) {
          if (b?.type !== "tool_use" || this.toolUses.has(b.id)) continue;
          this.toolUses.set(b.id, { name: b.name, input: b.input ?? {} });
          this.m.toolCalls += 1;
          this.m.toolCallsByName[b.name] = (this.m.toolCallsByName[b.name] ?? 0) + 1;
          if (b.name === "Read") {
            this.m.fileReads += 1;
            const i = b.input ?? {};
            const key = `${i.file_path}|${i.offset ?? ""}|${i.limit ?? ""}`;
            if (this.readKeys.has(key)) this.m.repeatReads += 1;
            else this.readKeys.add(key);
          }
          if (b.name === "Bash" && TEST_CMD.test(String(b.input?.command ?? ""))) this.m.testRuns += 1;
        }
        break;
      }
      case "user": {
        const content = msg.message?.content;
        if (!Array.isArray(content)) break;
        for (const b of content) {
          if (b?.type !== "tool_result") continue;
          this.toolResultChars += contentChars(b.content);
          const use = this.toolUses.get(b.tool_use_id);
          if (!use || !b.is_error) continue;
          if (EDIT_TOOLS.has(use.name)) this.m.failedEdits += 1;
          if (use.name === "Bash" && COMPILE_CMD.test(String(use.input?.command ?? ""))) {
            this.m.compileFailures += 1;
          }
        }
        break;
      }
      case "system":
        if (msg.subtype === "compact_boundary") this.m.compactions += 1;
        break;
      case "result": {
        // Results are cumulative per query(); keep the latest.
        this.resultSubtype = msg.subtype;
        this.m.turns = msg.num_turns ?? 0;
        this.m.wallMs = msg.duration_ms ?? 0;
        this.m.completed = msg.subtype === "success";
        this.costUsd = msg.total_cost_usd ?? 0;
        const u = { inputUncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
        for (const mu of Object.values<any>(msg.modelUsage ?? {})) {
          u.inputUncached += mu.inputTokens ?? 0;
          u.cacheRead += mu.cacheReadInputTokens ?? 0;
          u.cacheWrite += mu.cacheCreationInputTokens ?? 0;
          u.output += mu.outputTokens ?? 0;
        }
        Object.assign(this.usage, u);
        break;
      }
    }
  }

  finish(contextOverheadChars: number): void {
    // Stopped before a result message (e.g. budget cap): use per-message usage.
    if (this.m.turns === 0 && this.liveUsage.size > 0) {
      for (const u of this.liveUsage.values()) {
        this.usage.inputUncached += u.i;
        this.usage.cacheRead += u.r;
        this.usage.cacheWrite += u.w;
        this.usage.output += u.o;
      }
      this.m.turns = this.liveUsage.size;
    }
    this.usage.toolResultTokens = est(this.toolResultChars);
    this.usage.contextOverheadTokens = est(contextOverheadChars);
  }
}
