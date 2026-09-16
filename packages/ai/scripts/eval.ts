/**
 * Runs fixed game ideas through the full create → check → fix pipeline and
 * writes a comparison report. This is how the provider switch gets decided.
 *
 *   pnpm --filter @playloop/ai run eval:games -- --provider groq --limit 5
 *   pnpm --filter @playloop/ai run eval:games -- --provider anthropic --limit 30
 *
 * Options: --provider groq|anthropic (default AI_PROVIDER), --limit N (default 5),
 * --offset N (default 0). Groq's free tier allows about 40-60 generations a day
 * across the whole account, so run it in small batches.
 *
 * Output: packages/ai/.eval-results/<provider>-<timestamp>.{json,md}
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EVAL_IDEAS } from "../src/evalIdeas";
import { createGame, estimateCostUsd, getProvider, PROMPT_VERSION, type PipelineResult, type ProviderId } from "../src/index";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const providerId = flag("provider") as ProviderId | undefined;
const limit = Number(flag("limit") ?? 5);
const offset = Number(flag("offset") ?? 0);

const provider = getProvider(process.env, providerId);
const ideas = EVAL_IDEAS.slice(offset, offset + limit);
const results: { idea: string; result: PipelineResult }[] = [];

console.log(`Evaluating ${ideas.length} idea(s) on ${provider.id} (${provider.model("create")}), prompt ${PROMPT_VERSION}\n`);

for (const [i, idea] of ideas.entries()) {
  console.log(`[${i + 1}/${ideas.length}] ${idea}`);
  const result = await createGame(idea, {
    provider,
    onProgress: (e) => console.log(`    ${e.step.padEnd(8)} ${e.message}`),
  });
  results.push({ idea, result });
  const failed = result.game?.report.checks.filter((c) => c.status === "fail").map((c) => c.id) ?? [];
  console.log(`    → ${result.ok ? "PASS" : "FAIL"} in ${result.attempts.length} call(s), ${(result.durationMs / 1000).toFixed(0)} s${failed.length ? `, failing: ${failed.join(", ")}` : ""}${result.problem && !result.game ? `, ${result.problem}` : ""}\n`);
}

// ---- report ----
const passed = results.filter((r) => r.result.ok);
const totalUsage = results.reduce((s, r) => ({ inputTokens: s.inputTokens + r.result.usage.inputTokens, outputTokens: s.outputTokens + r.result.usage.outputTokens }), { inputTokens: 0, outputTokens: 0 });
const cost = estimateCostUsd(totalUsage, provider.capabilities);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const firstTry = results.filter((r) => r.result.ok && r.result.attempts.length === 1).length;

const md = [
  `# Game generation eval: ${provider.id}`,
  "",
  `- Model: \`${provider.model("create")}\` · prompt \`${PROMPT_VERSION}\` · ${new Date().toISOString()}`,
  `- **Passed all checks: ${passed.length}/${results.length}** (${firstTry} on the first try)`,
  `- AI calls per idea: ${avg(results.map((r) => r.result.attempts.length)).toFixed(1)} · time per idea: ${avg(results.map((r) => r.result.durationMs / 1000)).toFixed(0)} s`,
  `- Tokens: ${totalUsage.inputTokens.toLocaleString("en-US")} in / ${totalUsage.outputTokens.toLocaleString("en-US")} out${cost !== null ? ` · est. cost $${cost.toFixed(2)} ($${(cost / Math.max(1, passed.length)).toFixed(3)} per passing game)` : " · free tier"}`,
  "",
  "| # | Idea | Result | Calls | Failing checks / problem | Title |",
  "|---|---|---|---|---|---|",
  ...results.map((r, i) => {
    const failing = r.result.game?.report.checks.filter((c) => c.status === "fail").map((c) => c.title).join(", ") ?? "";
    return `| ${offset + i + 1} | ${r.idea} | ${r.result.ok ? "✅ pass" : "❌ fail"} | ${r.result.attempts.length} | ${failing || (r.result.ok ? "" : (r.result.problem ?? ""))} | ${r.result.game?.title ?? ""} |`;
  }),
].join("\n");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(root, ".eval-results");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, `${provider.id}-${stamp}.md`), md + "\n");
writeFileSync(resolve(outDir, `${provider.id}-${stamp}.json`), JSON.stringify({ provider: provider.id, model: provider.model("create"), promptVersion: PROMPT_VERSION, offset, results }, null, 2));
console.log(md);
console.log(`\nSaved to packages/ai/.eval-results/${provider.id}-${stamp}.{md,json}`);
