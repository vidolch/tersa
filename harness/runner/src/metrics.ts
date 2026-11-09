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
  /** API requests the SDK retried (rate limits, overload, connection errors). */
  apiRetries: number;
  /** Total time spent waiting before those retries. */
  apiRetryWaitMs: number;
  /** Bash commands that reach the network (git clone/fetch, curl, wget, npm view…). Should be 0. */
  networkCommands: number;
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
const NETWORK_CMD = /\bgit\s+(clone|fetch|pull|ls-remote)\b|\bcurl\b|\bwget\b|github\.com|\bnpm\s+(view|info)\b/;
const TEST_CMD = /\bvitest\b|\bnpm (run )?test\b|\bnode --test\b|\bjest\b/;

const est = (chars: number) => Math.round(chars / 4);

/** USD per 1M tokens (harness/prices.json). */
export interface Rate {
  inputMiss: number;
  cacheWrite?: number;
  inputHit: number;
  output: number;
}
export interface Price extends Rate {
  /** Applied per request when its input exceeds threshold tokens. */
  longContext?: Rate & { threshold: number };
}

// Shell commands that read code (as opposed to running tests or builds, whose
// output is P6 noise, not reading).
const READ_CMD = /(^|[|;&]\s*|\bcd\s+\S+\s*&&\s*)(cat|sed|head|tail|nl|awk|less|more|grep|rg|ag|git\s+(show|grep|diff|log\s+-p))\b/;
const SOURCE_FILE = /(?:^|\s|['"=])((?:\.{0,2}\/)?[\w@.\-/]*\.(?:tsx?|jsx?|mts|cts|mjs|cjs|json|md|pegjs|sql))\b/g;
// "path:line:" or "path:line-" or "path:" prefixes, as printed by grep -n / rg / Grep.
const LINE_PREFIX = /^((?:\.{0,2}\/)?[\w@.\-/]+\.(?:tsx?|jsx?|mts|cts|mjs|cjs|json|md|pegjs|sql))[:-](?:\d+[:-])?/;
export const UNATTRIBUTED = "(unattributed)";
// "path/file.ts:12" or "path/file.ts:12-30" inside query-layer output (see query/CONTRACT.md section 3).
const QUERY_LOCATION = /([\w@.\-/]+\.(?:tsx?|jsx?|mts|cts|mjs|cjs)):\d+(?:-\d+)?/;

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b: any) => (typeof b?.text === "string" ? b.text : "")).join("\n");
  return "";
}

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
  /** Characters returned by Read, per file path (P1 reading precision). */
  reads: Record<string, number> = {};
  /** Last tool calls, for diagnosing a run that crashed or timed out. */
  recentCalls: string[] = [];
  /** The flagged commands themselves, for review. */
  networkCommandLog: string[] = [];
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
    apiRetries: 0,
    apiRetryWaitMs: 0,
    networkCommands: 0,
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
  /** Error message if the agent process crashed. */
  crash: string | null = null;
  /**
   * Per tool: calls, output tokens (chars ÷ 4), and carried tokens = output
   * tokens × turns remaining after the result, an estimate of how much input
   * the result cost by being re-sent with every later turn.
   */
  toolCost: Record<string, { calls: number; outTokens: number; carriedTokens: number }> = {};
  private resultTurns: { tool: string; chars: number; turn: number }[] = [];
  private turnIds = new Set<string>();
  /** Calls the arm's steering redirected to the query layer. */
  steering = { redirects: 0, byTool: {} as Record<string, number> };
  /** Latest usage per API message id, for a running cost estimate. */
  private liveUsage = new Map<string, { i: number; r: number; w: number; o: number }>();

  /** Running cost from per-message usage at the given prices (USD per 1M tokens). */
  /** Turns so far in the main thread. */
  turnCount(): number {
    return this.turnIds.size;
  }
  /** Usage so far from per-message usage (input incl. cache, output). */
  liveTokens(): { input: number; output: number } {
    let input = 0, output = 0;
    for (const u of this.liveUsage.values()) {
      input += u.i + u.r + u.w;
      output += u.o;
    }
    return { input, output };
  }

  liveCost(p: Price): number {
    let c = 0;
    for (const u of this.liveUsage.values()) {
      const rate = p.longContext && u.i + u.r + u.w > p.longContext.threshold ? p.longContext : p;
      c += (u.i * rate.inputMiss + u.w * (rate.cacheWrite ?? rate.inputMiss) + u.r * rate.inputHit + u.o * rate.output) / 1e6;
    }
    return c;
  }

  /** Feed every message from the SDK stream. Subagent messages are counted too. */
  observe(msg: any): void {
    switch (msg.type) {
      case "assistant": {
        const id = msg.message?.id;
        if (id && !msg.parent_tool_use_id) this.turnIds.add(id);
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
          this.recentCalls.push(`${b.name} ${JSON.stringify(b.input ?? {}).slice(0, 160)}`);
          if (this.recentCalls.length > 10) this.recentCalls.shift();
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
          if (b.name === "Bash" && NETWORK_CMD.test(String(b.input?.command ?? ""))) {
            this.m.networkCommands += 1;
            this.networkCommandLog.push(String(b.input.command).slice(0, 300));
          }
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
          this.resultTurns.push({ tool: use?.name ?? "unknown", chars: contentChars(b.content), turn: this.turnIds.size });
          if (use && !b.is_error) this.attributeReading(use, b.content);
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
        if (msg.subtype === "api_retry") {
          this.m.apiRetries += 1;
          this.m.apiRetryWaitMs += msg.retry_delay_ms ?? 0;
        }
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

  private addRead(path: string, chars: number) {
    if (chars > 0) this.reads[path] = (this.reads[path] ?? 0) + chars;
  }

  /**
   * Reading = output of Read, Grep and code-reading shell commands, attributed
   * to the file it came from. Output that can't be tied to one file is kept
   * under UNATTRIBUTED, so it still counts against precision.
   */
  private attributeReading(use: { name: string; input: any }, content: unknown) {
    if (use.name === "Read" && typeof use.input?.file_path === "string") {
      this.addRead(use.input.file_path, contentChars(content));
      return;
    }
    if (use.name.startsWith("mcp__tersa__")) {
      // Query-layer output counts as reading, attributed like the rest: a line
      // naming a location belongs to that file; body lines belong to the file
      // of the most recent header.
      let current: string = UNATTRIBUTED;
      for (const line of resultText(content).split("\n")) {
        if (!line) continue;
        const loc = line.match(QUERY_LOCATION);
        if (loc && /^(###|  \S)/.test(line)) current = loc[1];
        this.addRead(loc ? loc[1] : current, line.length + 1);
      }
      return;
    }
    let fallback: string | null = null;
    if (use.name === "Grep") {
      fallback = typeof use.input?.path === "string" && SOURCE_FILE.test(" " + use.input.path) ? use.input.path : null;
      SOURCE_FILE.lastIndex = 0;
    } else if (use.name === "Bash") {
      const cmd = String(use.input?.command ?? "");
      if (!READ_CMD.test(cmd)) return;
      const files = [...cmd.matchAll(SOURCE_FILE)].map((m) => m[1]);
      fallback = new Set(files).size === 1 ? files[0] : null;
    } else {
      return;
    }
    for (const line of resultText(content).split("\n")) {
      if (!line) continue;
      const m = line.match(LINE_PREFIX);
      this.addRead(m ? m[1] : fallback ?? UNATTRIBUTED, line.length + 1);
    }
  }

  finish(contextOverheadChars: number): void {
    const total = this.turnIds.size;
    for (const r of this.resultTurns) {
      const c = (this.toolCost[r.tool] ??= { calls: 0, outTokens: 0, carriedTokens: 0 });
      c.calls += 1;
      const tok = est(r.chars);
      c.outTokens += tok;
      c.carriedTokens += tok * Math.max(0, total - r.turn);
    }
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
