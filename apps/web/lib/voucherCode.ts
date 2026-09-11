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
