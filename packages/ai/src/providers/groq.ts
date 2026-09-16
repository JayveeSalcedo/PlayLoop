/**
 * Groq adapter (development). OpenAI-style chat completions with strict JSON
 * schema output. The free tier is account-wide and small (8K tokens/minute,
 * 200K/day for gpt-oss-120b), so requests are sized to fit and 429s are
 * surfaced with the provider's retry-after for the pipeline to wait on.
 */
import Groq from "groq-sdk";
import { AiError, type AiProvider, type AiTask, type GenerateRequest, type GenerateResult } from "../types";

export const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";

export interface GroqProviderOptions {
  apiKey: string;
  models?: Partial<Record<AiTask, string>>;
  /** Free tier is 8000; raise it on a paid plan. */
  tokensPerMinute?: number;
}

export function createGroqProvider(options: GroqProviderOptions): AiProvider {
  // Retries are the pipeline's job: it waits the provider's retry-after and reports progress while it does.
  const client = new Groq({ apiKey: options.apiKey, maxRetries: 0, timeout: 120_000 });
  const model = (task: AiTask) => options.models?.[task] ?? GROQ_DEFAULT_MODEL;
  const tokensPerMinute = options.tokensPerMinute ?? 8_000;

  return {
    id: "groq",
    capabilities: { strictJson: true, tokensPerMinute, maxOutputTokens: 6_000, pricePerMillion: null },
    model,
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const started = Date.now();
      let completion;
      try {
        completion = await client.chat.completions.create({
          model: model(request.task),
          messages: [{ role: "system", content: request.system }, ...request.messages],
          response_format: {
            type: "json_schema",
            json_schema: { name: request.schemaName, schema: request.schema, strict: true },
          },
          max_completion_tokens: request.maxOutputTokens,
          reasoning_effort: request.effort,
        });
      } catch (e) {
        throw toAiError(e);
      }

      const choice = completion.choices[0];
      if (choice?.finish_reason === "length") {
        throw new AiError("output_too_long", "The AI ran out of room before finishing the game. Try a simpler idea.");
      }
      const content = choice?.message?.content;
      if (!content) throw new AiError("bad_output", "The AI returned an empty response.");
      let json: unknown;
      try {
        json = JSON.parse(content);
      } catch (e) {
        throw new AiError("bad_output", "The AI returned JSON that couldn't be parsed.", { cause: e });
      }
      return {
        json,
        model: completion.model ?? model(request.task),
        usage: { inputTokens: completion.usage?.prompt_tokens ?? 0, outputTokens: completion.usage?.completion_tokens ?? 0 },
        latencyMs: Date.now() - started,
      };
    },
  };
}

function toAiError(e: unknown): AiError {
  if (e instanceof Groq.AuthenticationError || e instanceof Groq.PermissionDeniedError) {
    return new AiError("auth", "Groq rejected the API key. Check GROQ_API_KEY.", { cause: e });
  }
  if (e instanceof Groq.RateLimitError) {
    return new AiError("rate_limited", "Groq's rate limit was reached.", { retryAfterMs: retryAfter(e.headers), cause: e });
  }
  if (e instanceof Groq.APIError) {
    // Groq answers 413 when prompt + requested output exceed the per-minute token limit on its own.
    if (e.status === 413) return new AiError("request_too_large", "The request is bigger than Groq's per-minute token limit allows.", { cause: e });
    if (e.status === 400 && /json|schema|validat/i.test(e.message)) {
      return new AiError("bad_output", "The AI's answer didn't match the required format.", { cause: e });
    }
    return new AiError("provider_error", `Groq error ${e.status ?? ""}: ${e.message}`.trim(), { cause: e });
  }
  return new AiError("provider_error", e instanceof Error ? e.message : String(e), { cause: e });
}

function retryAfter(headers: Headers | undefined): number | undefined {
  const value = headers?.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : undefined;
}
