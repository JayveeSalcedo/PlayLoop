import { GameCard, type LandingGame } from "./GameCard";

export function Collage({ games, sponsorByGameId }: { games: LandingGame[]; sponsorByGameId: Map<string, string> }) {
  if (games.length === 0) return null;

  const cards = games.map((g) => <GameCard key={g.id} game={g} sponsorName={sponsorByGameId.get(g.id)} />);

  return (
    <>
      <div className="landing-collage">
        {cards}
        <span className="landing-sticker">+{games[0]!.maxPoints} points</span>
        <span className="landing-sticker">Level 3 unlocked</span>
      </div>
      <div className="landing-collage-scroll">{cards}</div>
    </>
  );
}
