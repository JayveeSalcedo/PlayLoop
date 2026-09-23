import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | null = null;

/**
 * Anon-key Supabase client for browser-side Realtime subscriptions ONLY.
 * This app's auth is its own OTP/session system, not Supabase Auth — this
 * client never signs in and is never used to read or write data (Drizzle
 * over DATABASE_URL still owns that). Its only job is opening a Realtime
 * websocket for postgres_changes on community_messages.
 *
 * Returns null when the Supabase env vars aren't configured yet, rather
 * than throwing — chat still works (send/receive on refresh) without
 * Realtime, so a missing key shouldn't crash the whole page. Callers must
 * check for null before subscribing.
 */
export function getSupabaseBrowserClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  client = createClient(url, anonKey);
  return client;
}
