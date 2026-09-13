import Link from "next/link";

/**
 * The reverse of SurfaceLinks: that component links from /feed into whichever
 * of /staff, /brand, /admin a profile can reach, but none of those three had
 * a way back — a store-staff/brand login even lands there directly
 * (lib/surfaces.ts's landingFor()), so without this there was no in-app path
 * back to the player account at all, only the browser's own back button —
 * which doesn't exist once the app is installed (standalone display mode).
 */
export function BackToFeed({ className = "btn sm" }: { className?: string }) {
  return (
    <Link href="/feed" className={className}>
      ← Player app
    </Link>
  );
}
