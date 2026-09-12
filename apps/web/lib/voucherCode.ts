import { randomInt } from "node:crypto";

/**
 * Generates a redemption code like "BH-4F2A-91". Not security-sensitive —
 * uniqueness is enforced by the vouchers.code unique constraint, and a
 * collision just fails the redeeming transaction, which is safe to retry.
 */
export function generateVoucherCode(brandName: string): string {
  const prefix = (brandName.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "PL").padEnd(2, "X");
  const mid = randomInt(0, 36 ** 4).toString(36).padStart(4, "0").toUpperCase();
  const suffix = String(randomInt(0, 100)).padStart(2, "0");
  return `${prefix}-${mid}-${suffix}`;
}

/** Total alphanumerics in a code: 2 brand letters + 4 base36 + 2 digits. */
const CODE_LENGTH = 8;

/**
 * Canonicalises a code a human typed in, so the staff scanner matches what's
 * stored. Someone reading "BH-4F2A-91" off a phone screen at a till will type
 * it lowercase, with spaces, with an en dash, or with no separators at all —
 * and a "voucher not found" for a perfectly good voucher is the worst thing
 * this screen can do.
 *
 * Strips every non-alphanumeric character, uppercases, then re-inserts the
 * dashes at the fixed 2/4/2 boundaries. Input that isn't the right length is
 * returned uppercased-and-stripped rather than forced into the shape: it won't
 * match any stored code, which is the correct outcome for junk, and the caller
 * gets a clean "unknown code" instead of a false near-match.
 */
export function normalizeVoucherCode(input: string): string {
  const bare = (input ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (bare.length !== CODE_LENGTH) return bare;
  return `${bare.slice(0, 2)}-${bare.slice(2, 6)}-${bare.slice(6)}`;
}
