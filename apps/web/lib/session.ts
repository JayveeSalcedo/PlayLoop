import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "pl_session";
const ALG = "HS256";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Copy .env.example to .env and set a random value.");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  /** profile id */
  sub: string;
  email: string;
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

/** Use in server components/actions that require a logged-in profile; redirects to /login otherwise. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function clearSession() {
  (await cookies()).delete(COOKIE_NAME);
}
