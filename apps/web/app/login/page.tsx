import { getDb, schema } from "@playloop/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/app/_components/SubmitButton";
import { getSession } from "@/lib/session";
import { requestCode, startGuestSession } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; challenge?: string; redirect?: string }>;
}) {
  const { error, challenge, redirect: redirectTo } = await searchParams;
  const session = await getSession();

  let guestProfile: typeof schema.profiles.$inferSelect | undefined;
  if (session) {
    const db = getDb();
    const profile = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, session.sub))
      .then((r) => r[0]);

    if (profile && !profile.isGuest) {
      redirect("/feed");
    }
    if (profile?.isGuest) {
      guestProfile = profile;
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="text-4xl font-extrabold tracking-tight">playloop</h1>
      <p className="mt-1 text-soft">
        {guestProfile
          ? "Save your guest account to OnePass so your points never expire."
          : challenge
            ? "Almost there — log in to claim the points you just earned."
            : "Play. Create. Earn."}
      </p>

      {guestProfile && (
        <div className="card-hard mt-4 rounded-2xl bg-lemon p-3 text-xs font-extrabold text-ink [border:var(--border-thick)]">
          ✨ Currently playing as guest with{" "}
          <span className="inline-flex items-center gap-1 font-black">
            <span className="coin sm" aria-hidden="true" />
            {guestProfile.pointsBalance.toLocaleString("en-US")} pts
          </span>{" "}
          (Level {guestProfile.level}).
          Enter your email below to permanently save your progress.
        </div>
      )}

      <form action={requestCode} className="mt-6 flex flex-col gap-3">
        {challenge ? <input type="hidden" name="challenge" value={challenge} /> : null}
        {redirectTo ? <input type="hidden" name="redirect" value={redirectTo} /> : null}
        <label className="text-sm font-extrabold" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="rounded-2xl bg-card p-3 font-semibold [border:var(--border-thick)]"
          // Some browser extensions (autofill/password managers) inject a
          // `fdprocessedid` attribute onto inputs before React hydrates,
          // which otherwise trips a hydration-mismatch warning that has
          // nothing to do with our markup. See:
          // https://nextjs.org/docs/messages/react-hydration-error
          suppressHydrationWarning
        />
        {error ? <p className="text-sm font-bold text-gum">{error}</p> : null}
        <SubmitButton pendingText="Sending…">
          {guestProfile ? "Save progress with OnePass" : "Send me a code"}
        </SubmitButton>
      </form>
      <p className="mt-3 text-xs text-soft">
        We&apos;ll email you a 6-digit code. No password to remember.
      </p>

      {!guestProfile && !challenge && (
        <>
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-ink/15" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-soft">or</span>
            <div className="h-px flex-1 bg-ink/15" />
          </div>

          <form action={startGuestSession}>
            {redirectTo ? <input type="hidden" name="redirect" value={redirectTo} /> : null}
            <SubmitButton
              className="btn gum lg block w-full text-center"
              pendingText="Starting guest session…"
            >
              🎮 Play now, no sign-up
            </SubmitButton>
          </form>
          <p className="mt-2 text-center text-xs text-soft flex items-center justify-center gap-1">
            <span>Instant access · Earn up to</span>
            <span className="inline-flex items-center gap-1 font-bold text-ink">
              <span className="coin sm" aria-hidden="true" />
              2,000 pts
            </span>
            <span>· Save anytime</span>
          </p>
        </>
      )}
    </main>
  );
}
