/**
 * Mounts a game from its stored `games.config` shape, picking the template and
 * building its typed config from the game's type.
 *
 * Both the real player (apps/web/app/play/[slug]) and the creator studio's test
 * mode go through here, so a template added or a config key renamed only has to
 * change in one place — and a creator testing a game gets exactly the session a
 * player will get.
 */
import type { ItemKind, ThemeName } from "@playloop/ui";
import { runGame, type RunGameHandle } from "./engine";
import type { PlayableType } from "./rules";
import { catchGame, type CatchConfig } from "./templates/catch";
import { memoryGame, type MemoryConfig } from "./templates/memory";
import { quizGame, type QuizConfig } from "./templates/quiz";
import { reflexGame, type ReflexConfig, type ReflexTarget } from "./templates/reflex";
import type { Difficulty, QuizQuestion, RunGameResult } from "./types";

export interface GameRunOptions {
  difficulty: Difficulty;
  theme: ThemeName;
  config: Record<string, unknown>;
}

export function runGameFromConfig(
  type: PlayableType,
  opts: GameRunOptions,
  host: HTMLElement,
  onEnd: (result: RunGameResult) => void,
  onQuit?: () => void,
  onScoreChange?: (score: number) => void,
): RunGameHandle {
  const { difficulty, theme, config } = opts;

  switch (type) {
    case "catch": {
      const c: CatchConfig = { difficulty, theme, item: (config.item as ItemKind) ?? "bean" };
      return runGame(catchGame, c, host, onEnd, onQuit, onScoreChange);
    }
    case "quiz": {
      const c: QuizConfig = { difficulty, questions: (config.questions as QuizQuestion[]) ?? [] };
      return runGame(quizGame, c, host, onEnd, onQuit, onScoreChange);
    }
    case "memory": {
      const c: MemoryConfig = { difficulty, images: config.images as (string | null)[] | undefined };
      return runGame(memoryGame, c, host, onEnd, onQuit, onScoreChange);
    }
    case "reflex": {
      const c: ReflexConfig = { difficulty, target: (config.target as ReflexTarget) ?? "mint" };
      return runGame(reflexGame, c, host, onEnd, onQuit, onScoreChange);
    }
  }
}
