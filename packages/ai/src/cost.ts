import type { ProviderCapabilities, TokenUsage } from "./types";

/** Estimated USD for some usage at a provider's list price; null when the provider is free or unpriced. */
export function estimateCostUsd(usage: TokenUsage, capabilities: ProviderCapabilities): number | null {
  const price = capabilities.pricePerMillion;
  if (!price) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}
