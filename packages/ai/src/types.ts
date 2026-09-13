/**
 * The provider-neutral AI interface. App code only ever talks to AiProvider,
 * so switching Groq → Claude (or anything else) is configuration, not a rewrite.
 */

export type ProviderId = "groq" | "anthropic";

/** create: a new game from an idea · fix: repair after the game lab failed it · change: a player's edit request. */
export type AiTask = "create" | "fix" | "change";
export const AI_TASKS: readonly AiTask[] = ["create", "fix", "change"];

export type Effort = "low" | "medium" | "high";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateRequest {
  task: AiTask;
  system: string;
  messages: ChatMessage[];
  /** JSON Schema the response must match (strict: every property required, no extras). */
  schema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  effort: Effort;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateResult {
  json: unknown;
  model: string;
  usage: TokenUsage;
  latencyMs: number;
}

export interface ProviderCapabilities {
  /** Output is constrained to the JSON schema by the provider (not just requested). */
  strictJson: boolean;
  /** Account-wide tokens per minute on the plan in use, if limited; the pipeline keeps requests under it. */
  tokensPerMinute: number | null;
  /** Largest output the pipeline should request. */
  maxOutputTokens: number;
  /** USD per million tokens, for cost estimates. null when free / unknown. */
  pricePerMillion: { input: number; output: number } | null;
}

export interface AiProvider {
  id: ProviderId;
  capabilities: ProviderCapabilities;
  model(task: AiTask): string;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

export type AiErrorKind =
  | "not_configured"
  | "auth"
  | "rate_limited"
  | "request_too_large"
  | "output_too_long"
  | "refused"
  | "bad_output"
  | "provider_error";

/** Every provider failure is normalized to one of these, so callers can react without knowing the provider. */
export class AiError extends Error {
  readonly kind: AiErrorKind;
  /** For rate_limited: how long the provider asked us to wait. */
  readonly retryAfterMs?: number;

  constructor(kind: AiErrorKind, message: string, options: { retryAfterMs?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "AiError";
    this.kind = kind;
    this.retryAfterMs = options.retryAfterMs;
  }
}
