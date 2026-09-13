// Prints a readable summary of the newest eval run (or a given file): each
// attempt's non-passing checks, bot scores, and the start of the final code.
//   node scripts/inspect-eval.mjs [path/to/result.json] [ideaIndex]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../.eval-results");
const file =
  process.argv[2] ??
  readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => resolve(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const index = Number(process.argv[3] ?? 0);
const { results } = JSON.parse(readFileSync(file, "utf8"));
const { idea, result } = results[index];

console.log(`Idea: ${idea}\n`);
for (const a of result.attempts) {
  console.log(`round ${a.round} (${a.task})${a.error ? ` error: ${a.error.message}` : ""}`);
  if (!a.report) continue;
  for (const c of a.report.checks.filter((c) => c.status !== "pass")) console.log(`   ${c.status} ${c.title}: ${c.summary}${c.details.length ? " | " + c.details.join(" / ") : ""}`);
  console.log(`   runs: ${a.report.runs.map((r) => `${r.bot[0]}:${r.ok ? `${r.score}@${Math.round(r.ticks / 60)}s` : "crash"}`).join(" ")}`);
}
if (result.game) console.log(`\n--- final code (first 70 lines) ---\n${result.game.code.split("\n").slice(0, 70).join("\n")}`);
