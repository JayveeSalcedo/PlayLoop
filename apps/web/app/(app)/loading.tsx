import { Spinner } from "@/app/_components/Spinner";

/**
 * Shown immediately on navigation between /feed, /wallet, /rewards (all
 * children of this route group's layout) while the new page's server
 * component fetches its data. Placed at the (app) layout level, not per
 * page, so the tabbar (rendered by that layout, outside this Suspense
 * boundary) stays visible and interactive during the transition instead of
 * the whole screen going blank.
 *
 * This doesn't reduce the actual round-trip to the database — it makes the
 * wait visible instead of the screen looking frozen. See the DB client
 * comment in packages/db/src/client.ts for the actual latency floor.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Spinner size={48} className="text-violet" />
    </div>
  );
}
