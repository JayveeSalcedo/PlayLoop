import { createHash, randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@playloop/db";

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function pepper() {
  const p = process.env.OTP_PEPPER;
  if (!p) throw new Error("OTP_PEPPER is not set. Copy .env.example to .env and set a random value.");
  return p;
}

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${pepper()}:${email}:${code}`).digest("hex");
}

function normalize(email: string) {
  return email.trim().toLowerCase();
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Creates a fresh 6-digit code for `email`, stores its hash, and returns the plaintext code to send. */
export async function issueOtp(email: string): Promise<string> {
  const normalized = normalize(email);
  const code = generateCode();
  const db = getDb();
  await db.insert(schema.otpCodes).values({
    email: normalized,
    codeHash: hashCode(normalized, code),
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
  });
  return code;
}

/** Verifies `code` against the most recent unconsumed, unexpired code for `email`. */
export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const normalized = normalize(email);
  const db = getDb();

  const candidate = await db
    .select()
    .from(schema.otpCodes)
    .where(and(eq(schema.otpCodes.email, normalized), isNull(schema.otpCodes.consumedAt), gt(schema.otpCodes.expiresAt, new Date())))
    .orderBy(desc(schema.otpCodes.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  if (!candidate || candidate.attempts >= MAX_ATTEMPTS) return false;

  const ok = candidate.codeHash === hashCode(normalized, code);
  if (ok) {
    await db.update(schema.otpCodes).set({ consumedAt: new Date() }).where(eq(schema.otpCodes.id, candidate.id));
  } else {
    await db
      .update(schema.otpCodes)
      .set({ attempts: candidate.attempts + 1 })
      .where(eq(schema.otpCodes.id, candidate.id));
  }
  return ok;
}
