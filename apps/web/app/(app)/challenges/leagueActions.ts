"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/profile";
import { createCustomLeague, joinLeagueByCode } from "@/lib/leagues";

export async function joinLeagueAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const code = String(formData.get("code") || "").trim();
  const teamName = String(formData.get("teamName") || "").trim() || undefined;

  const { profile } = await requireProfile();
  const result = await joinLeagueByCode(profile.id, code, teamName);

  if (result.ok) {
    revalidatePath("/challenges");
  }

  return { ok: result.ok, error: result.error };
}

export async function createLeagueAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const name = String(formData.get("name") || "").trim();
  const kind = String(formData.get("kind") || "community").trim();
  const code = String(formData.get("code") || "").trim() || undefined;
  const teamName = String(formData.get("teamName") || "").trim() || undefined;
  const description = String(formData.get("description") || "").trim() || undefined;

  const { profile } = await requireProfile();
  const result = await createCustomLeague(profile.id, {
    name,
    kind,
    code,
    teamName,
    description,
  });

  if (result.ok) {
    revalidatePath("/challenges");
  }

  return { ok: result.ok, error: result.error };
}
