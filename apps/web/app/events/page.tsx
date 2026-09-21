import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { requireProfile } from "@/lib/profile";
import { ArenaHost } from "./ArenaHost";

export const metadata = {
  title: "PlayLoop Arena — Event Console",
  description: "Host live arena games on the big screen.",
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const { profile } = await requireProfile();
  const db = getDb();

  // Fetch published games for the game picker
  const games = await db
    .select({
      id: schema.games.id,
      slug: schema.games.slug,
      title: schema.games.title,
      theme: schema.games.theme,
      type: schema.games.type,
      coverImage: schema.games.coverImage,
    })
    .from(schema.games)
    .where(eq(schema.games.status, "published"));

  return (
    <ArenaHost
      games={games}
      profileName={profile.name ?? "Host"}
      initialCode={code?.toUpperCase()}
    />
  );
}
