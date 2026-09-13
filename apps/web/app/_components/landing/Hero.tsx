import Link from "next/link";
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
        <div className="landing-ctas">
          <Link href="/login" className="btn go lg">
            Try the player app
          </Link>
        </div>
      </div>
      <Collage games={games} sponsorByGameId={sponsorByGameId} />
    </section>
  );
}
