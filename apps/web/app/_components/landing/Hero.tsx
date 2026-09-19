import Link from "next/link";
import { SubmitButton } from "@/app/_components/SubmitButton";
import { startGuestSession } from "@/app/login/actions";
import { Collage } from "./Collage";
import type { LandingGame } from "./GameCard";

export function Hero({ games, sponsorByGameId }: { games: LandingGame[]; sponsorByGameId: Map<string, string> }) {
  return (
    <section id="top" className="landing-section landing-hero">
      <div>
        <div className="landing-stack" aria-label="Play. Create. Earn.">
          <span className="landing-stk">Play.</span>
          <span className="landing-stk">Create.</span>
          <span className="landing-stk">Earn.</span>
        </div>
        <p className="landing-lede">
          A game network where anyone plays 30-second games, earns points for real rewards, and pulls friends in
          with challenges. Creators build games from templates. Brands fund the prizes, and finally get engagement
          they can measure.
        </p>
        <div className="landing-ctas flex flex-wrap items-center gap-3">
          <form action={startGuestSession}>
            <SubmitButton className="btn go lg" pendingText="Starting…">
              🎮 Play now, no sign-up
            </SubmitButton>
          </form>
          <Link href="/login" className="btn card-hard bg-card px-4 py-3 font-extrabold text-sm [border:var(--border-thick)] hover:bg-paper">
            Log in with email
          </Link>
        </div>
      </div>
      <Collage games={games} sponsorByGameId={sponsorByGameId} />
    </section>
  );
}
