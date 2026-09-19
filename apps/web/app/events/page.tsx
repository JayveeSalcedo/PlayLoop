import { getEventConfig, getOrCreateEventPlayer } from "./actions";
import { EventArenaClient } from "./EventArenaClient";

export const metadata = {
  title: "PlayLoop Live — Arena Controller & Big-Screen LED Wall",
  description: "Live venue & mall activation mode for big-screen LED walls with instant QR join, spectator leaderboards, and 3D podium celebrations.",
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const eventCode = code?.toUpperCase() || "OASIS-LIVE";

  const [{ event, qrSvgString }, player] = await Promise.all([
    getEventConfig(eventCode),
    getOrCreateEventPlayer(),
  ]);

  return (
    <EventArenaClient
      initialEvent={event}
      initialQrSvg={qrSvgString}
      initialHostPlayer={player}
    />
  );
}
