import { getEventConfig, getOrCreateEventPlayer } from "@/lib/eventsServer";
import { EventMobileClient } from "./EventMobileClient";

export const metadata = {
  title: "PlayLoop Live — Join Arena",
  description: "Join the live mall big-screen activation on your phone.",
};

export default async function EventJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const eventCode = code?.toUpperCase() || "OASIS-LIVE";
  const [{ event }, player] = await Promise.all([
    getEventConfig(eventCode),
    getOrCreateEventPlayer(),
  ]);

  return <EventMobileClient initialPlayer={player} event={event} />;
}
