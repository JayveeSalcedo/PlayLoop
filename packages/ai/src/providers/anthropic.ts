/**
 * Anthropic adapter (the planned production provider). Claude Opus 5 with
 * adaptive thinking and JSON-schema structured output, streamed so long
 * generations don't hit HTTP timeouts.
 *
 * Server-side refusal fallbacks are enabled (`fallbacks: "default"`): if the
 * requested model declines on policy grounds, the API re-runs the request on
 * Anthropic's recommended fallback model within the same call.
 */
import Anthropic from "@anthropic-ai/sdk";
import { AiError, type AiProvider, type AiTask, type GenerateRequest, type GenerateResult } from "../types";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export interface AnthropicProviderOptions {
  apiKey: string;
  models?: Partial<Record<AiTask, string>>;
}

export function createAnthropicProvider(options: AnthropicProviderOptions): AiProvider {
  const client = new Anthropic({ apiKey: options.apiKey, maxRetries: 0 });
  const model = (task: AiTask) => options.models?.[task] ?? ANTHROPIC_DEFAULT_MODEL;

  return {
    id: "anthropic",
    capabilities: {
      strictJson: true,
      tokensPerMinute: null,
      maxOutputTokens: 32_000,
      // Claude Opus 5 list price; cost estimates only.
      pricePerMillion: model("create") === ANTHROPIC_DEFAULT_MODEL ? { input: 5, output: 25 } : null,
    },
    model,
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const started = Date.now();
      let message: Anthropic.Beta.BetaMessage;
      try {
        const stream = client.beta.messages.stream({
          model: model(request.task),
          max_tokens: request.maxOutputTokens,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: {
            effort: request.effort,
            format: { type: "json_schema", schema: request.schema },
          },
          system: request.system,
          messages: request.messages,
        });
        message = await stream.finalMessage();
      } catch (e) {
        throw toAiError(e);
      }

      if (message.stop_reason === "refusal") {
        throw new AiError("refused", "The AI declined to make this game. Try describing the idea differently.");
      }
      if (message.stop_reason === "max_tokens") {
        throw new AiError("output_too_long", "The AI ran out of room before finishing the game. Try a simpler idea.");
      }
      const text = message.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (e) {
        throw new AiError("bad_output", "The AI returned JSON that couldn't be parsed.", { cause: e });
      }
      return {
        json,
        model: message.model,
        usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
        latencyMs: Date.now() - started,
      };
    },
  };
}

function toAiError(e: unknown): AiError {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AiError("auth", "Anthropic rejected the API key. Check ANTHROPIC_API_KEY.", { cause: e });
  }
  if (e instanceof Anthropic.RateLimitError) {
    const seconds = Number(e.headers?.get("retry-after"));
    return new AiError("rate_limited", "Anthropic's rate limit was reached.", { retryAfterMs: Number.isFinite(seconds) ? seconds * 1000 : undefined, cause: e });
  }
  if (e instanceof Anthropic.BadRequestError) {
    return new AiError("provider_error", `Anthropic rejected the request: ${e.message}`, { cause: e });
  }
  if (e instanceof Anthropic.APIError) {
    return new AiError("provider_error", `Anthropic error ${e.status ?? ""}: ${e.message}`.trim(), { cause: e });
  }
  return new AiError("provider_error", e instanceof Error ? e.message : String(e), { cause: e });
}
