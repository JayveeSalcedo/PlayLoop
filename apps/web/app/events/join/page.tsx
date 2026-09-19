import { VENUE_EVENTS } from "@/lib/events";
import { getOrCreateEventPlayer } from "../actions";
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
  const event = VENUE_EVENTS[eventCode] ?? VENUE_EVENTS["OASIS-LIVE"]!;
  const player = await getOrCreateEventPlayer();

  return <EventMobileClient initialPlayer={player} event={event} />;
}
