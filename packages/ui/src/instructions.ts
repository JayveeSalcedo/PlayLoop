/**
 * "How to play" content shown in the pre-game instructions modal
 * (apps/web/app/play/[slug]/HowToPlayModal.tsx) — one small data table rather
 * than a bespoke component per template, since the 8 templates' controls only
 * span 3 gesture families (tap, swipe/arrow-keys, drag).
 */
import { BAD_FACE, GOOD_FACE, MEMORY_BACK, icon, type GameArtType } from "./art";

export interface HowToPlay {
  /** Pre-rendered <svg> via icon(...), shown as the modal's header badge. */
  gestureIcon: string;
  /** 2-4 short, rule-accurate lines — checked against each template's real mechanics, not generic copy. */
  steps: string[];
  /** Optional extra art fragments (existing per-template SVGs) shown as small chips above the steps. */
  extraArt?: string[];
}

export const HOW_TO_PLAY: Record<GameArtType, HowToPlay> = {
  quiz: {
    gestureIcon: icon("tap"),
    steps: [
      "Read the question and tap the answer you think is right.",
      "Faster correct answers earn a bigger speed bonus.",
      "Miss it or run out of time and you move on with zero for that one — no going back.",
    ],
  },
  catch: {
    gestureIcon: icon("drag"),
    steps: [
      "Drag the cup left and right (or use arrow keys).",
      "Catch the falling items for points — golden ones are worth extra.",
      "Dodge the spiky ones — they cost you points.",
    ],
  },
  memory: {
    gestureIcon: icon("tap"),
    steps: [
      "Tap a card to flip it face up.",
      "Flip a second card looking for a match.",
      "Match all the pairs — the faster you finish, the bigger the time bonus.",
    ],
    extraArt: [MEMORY_BACK],
  },
  reflex: {
    gestureIcon: icon("tap"),
    steps: [
      "Tap the smiling orbs the instant they pop up.",
      "Leave the spiky ones alone — tapping them costs points.",
      "Chain hits without missing to build a combo multiplier.",
    ],
    extraArt: [GOOD_FACE, BAD_FACE],
  },
  merge: {
    gestureIcon: icon("swipe"),
    steps: [
      "Swipe (or use arrow keys) to slide every tile at once.",
      "Two matching tiles that collide merge into the next tier.",
      "Reach the top tier to win the round.",
    ],
  },
  slide: {
    gestureIcon: icon("tap"),
    steps: [
      "Tap any tile next to the empty gap to slide it in.",
      "Arrow keys work too — they move the tile in that direction into the gap.",
      "Get every tile back to its home spot before time runs out for the biggest bonus.",
    ],
  },
  snake: {
    gestureIcon: icon("swipe"),
    steps: [
      "Swipe (or use arrow keys) to steer the snake.",
      "Eat the food to grow and score points.",
      "Don't run into the wall or your own tail.",
    ],
  },
  tictactoe: {
    gestureIcon: icon("tap"),
    steps: [
      "You're X — tap an empty square to place your mark.",
      "The computer (O) moves right after you.",
      "Get three in a row — across, down, or diagonal — to win. A full board with no winner is a draw.",
    ],
  },
};

/** Code games have no fixed control scheme (GameMeta carries no gesture info), so this is a generic fallback — the game's own meta.hint text fills in the specifics. */
export const CODE_GAME_HOW_TO_PLAY: Pick<HowToPlay, "gestureIcon"> = {
  gestureIcon: icon("gamepad"),
};
