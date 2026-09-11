import { requestCode } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="text-4xl font-extrabold tracking-tight">playloop</h1>
      <p className="mt-1 text-soft">Play. Create. Earn.</p>
      <form action={requestCode} className="mt-8 flex flex-col gap-3">
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
        />
        {error ? <p className="text-sm font-bold text-gum">{error}</p> : null}
        <button type="submit" className="btn go lg block">
          Send me a code
        </button>
      </form>
      <p className="mt-4 text-xs text-soft">
        We&apos;ll email you a 6-digit code. No password to remember.
      </p>
    </main>
  );
}
