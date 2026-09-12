import { randomInt } from "node:crypto";

/**
 * Generates a short, URL-safe challenge code like "k3f9a2x1" for /c/<code>
 * links. Not security-sensitive — uniqueness is enforced by the
 * challenges.code unique constraint, and a collision just fails the
 * insert, which is safe to retry (same reasoning as generateVoucherCode).
 */
export function generateChallengeCode(): string {
  return randomInt(0, 36 ** 8).toString(36).padStart(8, "0");
}
