import Link from "next/link";
import { surfacesFor } from "@/lib/surfaces";

/**
 * Links to whichever staff surfaces this account can reach.
 *
 * Renders nothing at all for an ordinary player, which is almost everyone — so
 * it costs the common case a query and no pixels. Before this, /admin, /staff
 * and /brand had no link anywhere in the app and could only be reached by
 * typing the URL.
 */
export async function SurfaceLinks({ profile }: { profile: { id: string; email: string } }) {
  const surfaces = await surfacesFor(profile);
  if (surfaces.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-xs font-extrabold tracking-wide text-soft uppercase">Also yours</h2>
      <div className="mt-2 flex flex-col gap-2">
        {surfaces.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-baseline gap-2 rounded-2xl bg-card p-3 [border:var(--border-thick)]"
          >
            <span className="font-extrabold">{s.label}</span>
            <span className="truncate text-xs font-bold text-soft">{s.detail}</span>
            <span aria-hidden="true" className="ml-auto shrink-0 font-extrabold text-soft">
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
