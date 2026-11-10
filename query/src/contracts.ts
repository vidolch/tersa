/**
 * Generates a one-line contract doc comment for every function in the given files, by asking a
 * model to describe what each function's code does. Used to build arm I's code patches: the
 * files are the suite's pristine (correct) code, and the model is told nothing about any task.
 *
 *   node src/contracts.ts <repo root> <file>... [--model claude-haiku-5-5] [--fake] [--json out.json]
 *
 * Writes the commented files in place (the caller diffs them). --fake writes placeholder
 * contracts without calling a model (for tests). Needs ANTHROPIC_API_KEY otherwise.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export interface FnSite {
  id: string; // name@line, unique within the file
  name: string;
  line: number; // 0-based line of the declaration statement
  indent: string;
  source: string;
}

/** Top-level functions, exported or not, arrow/function constants, and class methods. */
export function findFunctions(fileName: string, text: string): FnSite[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lines = text.split("\n");
  const out: FnSite[] = [];
  const add = (name: string, node: ts.Node) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    const indent = /^\s*/.exec(lines[line])![0];
    const src = node.getText(sf).split("\n");
    out.push({
      id: `${name}@${line + 1}`,
      name,
      line,
      indent,
      source: (src.length > 80 ? [...src.slice(0, 80), "  // …"] : src).join("\n"),
    });
  };
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) add(st.name.text, st);
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)))
          add(d.name.text, st);
      }
    } else if (ts.isClassDeclaration(st) && st.name) {
      for (const m of st.members) {
        if ((ts.isMethodDeclaration(m) || ts.isConstructorDeclaration(m)) && m.body) {
          const n = ts.isConstructorDeclaration(m) ? "constructor" : m.name.getText(sf);
          add(`${st.name.text}.${n}`, m);
        }
      }
    }
  }
  return out;
}

/** Inserts `/** Contract: … *\/` above each site, bottom-up so line numbers stay valid. */
export function insertContracts(text: string, sites: FnSite[], contracts: Record<string, string>): string {
  const lines = text.split("\n");
  for (const s of [...sites].sort((a, b) => b.line - a.line)) {
    const c = contracts[s.id]?.trim();
    if (!c) continue;
    const words = `Contract: ${c.replace(/\*\//g, "* /").replace(/\s+/g, " ")}`.split(" ");
    const wrapped: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).length > 92 && cur) { wrapped.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) wrapped.push(cur);
    const block = [`${s.indent}/**`, ...wrapped.map((l) => `${s.indent} * ${l}`), `${s.indent} */`];
    lines.splice(s.line, 0, ...block);
  }
  return lines.join("\n");
}

const PROMPT = `You are documenting a TypeScript module. For each function listed below, write its contract in one or two sentences: what it takes, what it returns or changes, and any ordering, range or invariant the code guarantees. Describe precisely what the code does, not what it might be for. No speculation, no examples.

Reply with only a JSON object that maps each function id to its contract.`;

async function askModel(model: string, file: string, text: string, sites: FnSite[]): Promise<Record<string, string>> {
  const body = {
    model,
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: `${PROMPT}\n\nFile: ${file}\n\`\`\`ts\n${text}\n\`\`\`\n\nFunction ids:\n${sites.map((s) => `- ${s.id}`).join("\n")}`,
      },
    ],
  };
  for (let attempt = 1; ; attempt++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const j: any = await r.json();
      const t: string = j.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      const m = /\{[\s\S]*\}/.exec(t);
      if (!m) throw new Error(`no JSON in reply for ${file}: ${t.slice(0, 200)}`);
      return JSON.parse(m[0]);
    }
    if (attempt >= 4 || (r.status < 500 && r.status !== 429)) throw new Error(`${r.status} ${await r.text()}`);
    await new Promise((res) => setTimeout(res, 5000 * attempt));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const model = opt("--model") ?? "claude-haiku-5-5";
  const fake = args.includes("--fake");
  const jsonOut = opt("--json");
  const positional = args.filter((a, i) => !a.startsWith("--") && !["--model", "--json"].includes(args[i - 1]));
  const [root, ...files] = positional;
  const all: Record<string, Record<string, string>> = {};
  for (const f of files) {
    const path = join(root, f);
    const text = readFileSync(path, "utf8");
    const sites = findFunctions(f, text);
    const contracts = fake
      ? Object.fromEntries(sites.map((s) => [s.id, `placeholder contract for ${s.name}.`]))
      : await askModel(model, f, text, sites);
    const missing = sites.filter((s) => !contracts[s.id]).map((s) => s.id);
    console.log(`${f}: ${sites.length} functions, ${sites.length - missing.length} contracts${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
    writeFileSync(path, insertContracts(text, sites, contracts));
    all[f] = contracts;
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ model, files: all }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
