import { artSVG, type GameArtType, type ThemeName } from "@playloop/ui";

export interface LandingGame {
  id: string;
  title: string;
  /** Null for a code game — it isn't one of the four templates. */
  type: string | null;
  theme: string;
  difficulty: string;
  maxPoints: number;
  playCount: number;
  config: unknown;
}

export function GameCard({ game, sponsorName }: { game: LandingGame; sponsorName?: string | null }) {
  const config = (game.config ?? {}) as { item?: string };

  return (
    <div className="landing-gamecard">
      <div
        className="aspect-[4/3]"
        dangerouslySetInnerHTML={{
          __html: artSVG(game.type as GameArtType, game.theme as ThemeName, (config.item as never) ?? "bean"),
        }}
      />
      <div className="p-3">
        {sponsorName ? (
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-soft">Sponsored by {sponsorName}</p>
        ) : null}
        <p className="font-extrabold leading-tight">{game.title}</p>
        <p className="mt-1 text-xs font-bold text-soft">
          {game.difficulty} · up to {game.maxPoints} pts · {game.playCount.toLocaleString("en-US")} plays
        </p>
      </div>
    </div>
  );
}
