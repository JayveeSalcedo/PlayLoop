"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "./Spinner";

/**
 * Sign out. A plain form POST to the existing /logout route handler — no
 * client JS to *submit* it, and POST rather than a link on purpose: a GET
 * would let a prefetch or an <img> on some other page sign the user out.
 * The confirm step below is client-only UI in front of that same form; it
 * doesn't change how the sign-out itself is submitted.
 *
 * Lives here rather than in one page because every signed-in surface needs it:
 * the player's wallet, and the three staff surfaces, where a shared device
 * makes handing over to the next person the normal case — which is exactly
 * why a stray tap shouldn't sign someone out with no way back.
 */
function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn go lg block">
      {pending ? (
        <>
          <Spinner size={22} /> Signing out…
        </>
      ) : (
        "Sign out"
      )}
    </button>
  );
}

export function SignOut({ className = "btn" }: { className?: string }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setConfirming(true)}>
        Sign out
      </button>
      {confirming ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40"
          onClick={() => setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl bg-paper p-6 [border-top:var(--border-thick)]"
            onClick={(e) => e.stopPropagation()}
          >
            <b className="text-xl">Sign out?</b>
            <p className="mt-1 text-sm font-bold text-soft">You&apos;ll need a fresh code to sign back in.</p>
            <form action="/logout" method="post" className="mt-4">
              <ConfirmButton />
            </form>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn block mt-2"
              style={{ boxShadow: "none" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
