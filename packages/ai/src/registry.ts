/**
 * Picks the provider from configuration:
 *
 *   AI_PROVIDER=groq | anthropic          (default groq)
 *   AI_MODEL_CREATE / AI_MODEL_FIX / AI_MODEL_CHANGE   optional per-task model overrides
 *   GROQ_API_KEY / ANTHROPIC_API_KEY      server-side only
 *   GROQ_TOKENS_PER_MINUTE                optional, for a paid Groq plan
 */
import { createAnthropicProvider } from "./providers/anthropic";
import { createGroqProvider } from "./providers/groq";
import { AiError, AI_TASKS, type AiProvider, type AiTask, type ProviderId } from "./types";

type Env = Record<string, string | undefined>;

export function configuredProviderId(env: Env = process.env): ProviderId {
  const id = (env.AI_PROVIDER ?? "groq").trim().toLowerCase();
  if (id !== "groq" && id !== "anthropic") {
    throw new AiError("not_configured", `AI_PROVIDER must be "groq" or "anthropic" (got "${env.AI_PROVIDER}").`);
  }
  return id;
}

export function getProvider(env: Env = process.env, override?: ProviderId): AiProvider {
  const id = override ?? configuredProviderId(env);
  const models: Partial<Record<AiTask, string>> = {};
  for (const task of AI_TASKS) {
    const value = env[`AI_MODEL_${task.toUpperCase()}`]?.trim();
    if (value) models[task] = value;
  }

  if (id === "groq") {
    const apiKey = env.GROQ_API_KEY?.trim();
    if (!apiKey) throw new AiError("not_configured", "GROQ_API_KEY isn't set.");
    const tpm = Number(env.GROQ_TOKENS_PER_MINUTE);
    return createGroqProvider({ apiKey, models, tokensPerMinute: Number.isFinite(tpm) && tpm > 0 ? tpm : undefined });
  }

  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new AiError("not_configured", "ANTHROPIC_API_KEY isn't set.");
  return createAnthropicProvider({ apiKey, models });
}
