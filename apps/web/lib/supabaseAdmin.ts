import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | null = null;

/**
 * Service-role Supabase client. SERVER ONLY — SUPABASE_SERVICE_ROLE_KEY is a
 * secret with full database/storage access, on par with DATABASE_URL. Only
 * ever import this from a "use server" file. Its only job here is Storage
 * uploads for community/chat images; all data reads/writes still go through
 * Drizzle.
 */
export function getSupabaseAdminClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL are not set.");
  }
  client = createClient(url, serviceKey, { auth: { persistSession: false } });
  return client;
}
