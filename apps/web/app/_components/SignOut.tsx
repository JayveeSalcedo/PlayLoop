/**
 * Sign out. A plain form POST to the existing /logout route handler — no
 * client JS, and POST rather than a link on purpose: a GET would let a
 * prefetch or an <img> on some other page sign the user out.
 *
 * Lives here rather than in one page because every signed-in surface needs it:
 * the player's wallet, and the three staff surfaces, where a shared device
 * makes handing over to the next person the normal case.
 */
export function SignOut({ className = "btn" }: { className?: string }) {
  return (
    <form action="/logout" method="post">
      <button type="submit" className={className}>
        Sign out
      </button>
    </form>
  );
}
