"use server";

import { qrSvg } from "@/lib/qr";
import { requireSession } from "@/lib/session";

/**
 * Renders a game's share link as a QR SVG. Takes the full URL rather than
 * just a slug because only the browser knows its own origin (same reasoning
 * as createChallenge in challengeActions.ts — no NEXT_PUBLIC_APP_URL env var
 * needed). Only requires a signed-in session, not the game's creator: the
 * link is meant to be shared and scanned by anyone.
 */
export async function gameShareQrSvg(url: string): Promise<string> {
  await requireSession();
  return qrSvg(url);
}
