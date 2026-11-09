import { test } from "node:test";
import assert from "node:assert/strict";
import { SHELL_EDIT } from "../src/metrics.ts";

test("SHELL_EDIT detects shell writes to source files", () => {
  for (const c of [
    "sed -i 's/a/b/' src/x.ts",
    "sed -i.bak -e 's/a/b/' x.tsx",
    "cat > packages/loot-core/src/rules.ts << 'EOF'",
    "cat >> src/a.test.ts <<EOF",
    "perl -pi -e 's/x/y/' a.js",
    "node -e \"fs.writeFileSync('a.ts', s)\"",
    "python3 -c \"open('a.ts').write_text(s)\"",
    "git apply /tmp/p.diff",
  ]) assert.ok(SHELL_EDIT.test(c), c);
});

test("SHELL_EDIT ignores reads and temp output", () => {
  for (const c of [
    "sed -n '1,40p' src/x.ts",
    "cat src/x.ts",
    "grep -rn foo src > /tmp/out.txt",
    "yarn vitest run 2>&1 | tail -30",
    "ls src/*.ts",
  ]) assert.ok(!SHELL_EDIT.test(c), c);
});
