/**
 * Checks that the configured provider's key works, with one tiny request.
 * Prints only ok/model/usage, never the key.
 *
 *   pnpm --filter @playloop/ai smoke                 # AI_PROVIDER, default groq
 *   pnpm --filter @playloop/ai smoke -- anthropic
 */
import { getProvider, type ProviderId } from "../src/index";
import { AiError } from "../src/types";

const requested = process.argv.slice(2).find((a) => a === "groq" || a === "anthropic") as ProviderId | undefined;

try {
  const provider = getProvider(process.env, requested);
  const result = await provider.generate({
    task: "create",
    system: "Reply with the JSON the schema asks for. Keep it tiny.",
    messages: [{ role: "user", content: 'Set ok to true and word to "ready".' }],
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "word"],
      properties: { ok: { type: "boolean" }, word: { type: "string" } },
    },
    schemaName: "smoke",
    maxOutputTokens: provider.id === "groq" ? 400 : 2_000,
    effort: "low",
  });
  console.log(JSON.stringify({ provider: provider.id, ok: true, model: result.model, reply: result.json, usage: result.usage, latencyMs: result.latencyMs }));
} catch (e) {
  const kind = e instanceof AiError ? e.kind : "unexpected";
  console.log(JSON.stringify({ ok: false, kind, message: e instanceof Error ? e.message : String(e) }));
  process.exitCode = 1;
}
