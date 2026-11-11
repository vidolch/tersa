/**
 * Keeps only the contracts that add information: for each function, a model sees its source
 * (name, signature, comments, body) and its generated contract, and decides whether the
 * contract states something a reader would not already get from the name, signature and
 * comments. Used for arm Q2 (iteration 23). Like contracts.ts, it sees the pristine code only.
 *
 *   node src/contracts-filter.ts <repo root> <in.json> <out.json> [--model claude-haiku-5-5]
 *
 * in/out: { model, files: { file: { "name@line": contract } } } (contracts.ts --json format);
 * out adds { filter: { model, kept, dropped } }.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findFunctions } from "./contracts.ts";

const PROMPT = `For each function below you get its source and a proposed contract (a one- or two-sentence description of what it does).

Decide for each whether the contract tells a reader something important that is NOT already evident from the function's name, its signature and its comments: for example a direction or order, a range, a unit, a side effect, an edge case, or which of two plausible behaviours it has. A contract that only restates the name and signature, or describes the code line by line, is not worth showing.

Reply with only a JSON object mapping each function id to true (show the contract) or false (don't).`;

async function ask(model: string, file: string, items: { id: string; source: string; contract: string }[]) {
  const body = {
    model,
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `${PROMPT}\n\nFile: ${file}\n\n${items
          .map((i) => `### ${i.id}\nSource:\n\`\`\`ts\n${i.source}\n\`\`\`\nContract: ${i.contract}`)
          .join("\n\n")}`,
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
      if (m) return JSON.parse(m[0]) as Record<string, boolean>;
      if (attempt >= 3) throw new Error(`no JSON for ${file}: ${t.slice(0, 200)}`);
    } else if (attempt >= 4 || (r.status < 500 && r.status !== 429)) throw new Error(`${r.status} ${await r.text()}`);
    await new Promise((res) => setTimeout(res, 5000 * attempt));
  }
}

async function main() {
  const [root, inPath, outPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const mi = process.argv.indexOf("--model");
  const model = mi > 0 ? process.argv[mi + 1] : "claude-haiku-5-5";
  const src = JSON.parse(readFileSync(inPath, "utf8"));
  const out: Record<string, Record<string, string>> = {};
  let kept = 0, dropped = 0;
  for (const [file, contracts] of Object.entries(src.files as Record<string, Record<string, string>>)) {
    const sites = new Map(findFunctions(file, readFileSync(join(root, file), "utf8")).map((s) => [s.id, s]));
    const items = Object.entries(contracts).map(([id, contract]) => ({ id, contract, source: sites.get(id)?.source ?? "(source not found)" }));
    const verdict: Record<string, boolean> = {};
    for (let i = 0; i < items.length; i += 15) Object.assign(verdict, await ask(model, file, items.slice(i, i + 15)));
    for (const it of items) {
      if (verdict[it.id] === false) { dropped++; continue; }
      (out[file] ??= {})[it.id] = it.contract;
      kept++;
    }
    console.log(`${file}: kept ${Object.keys(out[file] ?? {}).length} of ${items.length}`);
  }
  writeFileSync(outPath, JSON.stringify({ model: src.model, filter: { model, kept, dropped }, files: out }, null, 1));
  console.log(`kept ${kept}, dropped ${dropped}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
