import { verifyCode } from "./actions";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  const { email = "", error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Check your email</h1>
      <p className="mt-1 text-soft">
        We sent a 6-digit code to <b className="text-ink">{email}</b>.
      </p>
      <form action={verifyCode} className="mt-8 flex flex-col gap-3">
        <input type="hidden" name="email" value={email} />
        <label className="text-sm font-extrabold" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          placeholder="123456"
          className="rounded-2xl bg-card p-3 text-center text-2xl font-extrabold tracking-[0.3em] [border:var(--border-thick)]"
          // See the comment on the email input in app/login/page.tsx — some
          // browser extensions inject attributes onto inputs pre-hydration.
          suppressHydrationWarning
        />
        {error ? <p className="text-sm font-bold text-gum">{error}</p> : null}
        <button type="submit" className="btn go lg block" suppressHydrationWarning>
          Continue
        </button>
      </form>
    </main>
  );
}
