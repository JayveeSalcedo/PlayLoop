import { NextResponse } from "next/server";

/** Largest request body the lab accepts: a max-size input log plus JSON overhead. */
const MAX_BODY_BYTES = 300_000;

export async function readJson(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: NextResponse.json({ error: "Request is too large." }, { status: 413 }) };
  }
  try {
    const body = JSON.parse(text) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 }) };
  }
}
