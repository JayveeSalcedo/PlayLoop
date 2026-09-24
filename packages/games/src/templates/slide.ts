/**
 * "Slide" game template — the classic 8-puzzle: 8 tiles and one gap in a 3x3
 * grid, tap a tile next to the gap (or use arrow keys) to slide it in, until
 * every tile sits in its home position.
 *
 * The grid math (solvedGrid/isSolved/slide/slideDirection/shuffle) is pure
 * and DOM-free so it can be unit tested directly — see slide.test.ts — same
 * split rules.ts uses between "what's a legal/valid play" and the template.
 */
import { INK, slideTileArt, type ThemeName } from "@playloop/ui";
import { GAME_DURATION_SECONDS, SLIDE_SHUFFLE_MOVES } from "../rules";
import type { Difficulty, GameApi, GameDefinition } from "../types";
import { escapeHtml } from "../util";

export const SLIDE_GRID_SIZE = 3;
const CELL_COUNT = SLIDE_GRID_SIZE * SLIDE_GRID_SIZE;
const GAP_HOME = CELL_COUNT - 1;

/** A cell holds a tile's home index (0..7) or null for the gap. */
export type SlideCell = number | null;
export type SlideDirection = "up" | "down" | "left" | "right";

export function solvedGrid(): SlideCell[] {
  return [...Array(GAP_HOME).keys(), null];
}

export function isSolved(grid: readonly SlideCell[]): boolean {
  return grid.every((v, i) => v === (i === GAP_HOME ? null : i));
}

export function gapIndexOf(grid: readonly SlideCell[]): number {
  return grid.indexOf(null);
}

function neighborsOf(index: number): number[] {
  const n = SLIDE_GRID_SIZE;
  const r = Math.floor(index / n);
  const c = index % n;
  const out: number[] = [];
  if (r > 0) out.push(index - n);
  if (r < n - 1) out.push(index + n);
  if (c > 0) out.push(index - 1);
  if (c < n - 1) out.push(index + 1);
  return out;
}

/** Slides the tile at `tileIndex` into the gap, if they're adjacent; no-op (moved:false) otherwise. */
export function slide(grid: readonly SlideCell[], tileIndex: number): { grid: SlideCell[]; moved: boolean } {
  const gap = gapIndexOf(grid);
  if (!neighborsOf(gap).includes(tileIndex)) return { grid: grid.slice(), moved: false };
  const next = grid.slice();
  next[gap] = next[tileIndex]!;
  next[tileIndex] = null;
  return { grid: next, moved: true };
}

/** Direction is which way the gap moves — "up" slides the tile below the gap upward into it. */
export function slideDirection(grid: readonly SlideCell[], dir: SlideDirection): { grid: SlideCell[]; moved: boolean } {
  const gap = gapIndexOf(grid);
  const n = SLIDE_GRID_SIZE;
  const r = Math.floor(gap / n);
  const c = gap % n;
  let tileIndex: number | null = null;
  if (dir === "up" && r < n - 1) tileIndex = gap + n;
  else if (dir === "down" && r > 0) tileIndex = gap - n;
  else if (dir === "left" && c < n - 1) tileIndex = gap + 1;
  else if (dir === "right" && c > 0) tileIndex = gap - 1;
  if (tileIndex == null) return { grid: grid.slice(), moved: false };
  return slide(grid, tileIndex);
}

/**
 * A guaranteed-solvable scramble: `moves` random valid slides from the
 * solved state (never immediately undoing the previous slide, for a less
 * trivial mix). Any sequence of legal slides is reversible, so this can
 * never produce an unsolvable board — unlike shuffling the 9 values
 * directly, which needs a parity check half the time it wouldn't be solvable.
 */
export function shuffle(moves: number, rng: () => number = Math.random): SlideCell[] {
  let grid = solvedGrid();
  let lastGap = gapIndexOf(grid);
  for (let i = 0; i < moves; i++) {
    const gap = gapIndexOf(grid);
    const candidates = neighborsOf(gap);
    const options = candidates.filter((idx) => idx !== lastGap);
    const pool = options.length ? options : candidates;
    const pick = pool[Math.floor(rng() * pool.length)]!;
    lastGap = gap;
    grid = slide(grid, pick).grid;
  }
  return grid;
}

export interface SlideConfig {
  difficulty: Difficulty;
  theme: ThemeName;
  /** A single photo to slice into the 8 tiles (data/https URL); unset uses the built-in shape set. */
  image?: string | null;
}

function tileHtml(home: number, theme: ThemeName, image: string | null | undefined): string {
  const attrs = `class="sp-t" type="button" data-home="${home}" aria-label="Tile ${home + 1}"`;
  if (image) {
    const col = home % SLIDE_GRID_SIZE;
    const row = Math.floor(home / SLIDE_GRID_SIZE);
    const pos = `${(col * 100) / (SLIDE_GRID_SIZE - 1)}% ${(row * 100) / (SLIDE_GRID_SIZE - 1)}%`;
    return `<button ${attrs} style="--mg-ink:${INK};background-image:url('${escapeHtml(image)}');background-size:${SLIDE_GRID_SIZE * 100}% ${SLIDE_GRID_SIZE * 100}%;background-position:${pos}"></button>`;
  }
  return `<button ${attrs} style="--mg-ink:${INK}">${slideTileArt(home, theme)}</button>`;
}

function render(gridEl: HTMLElement, grid: readonly SlideCell[], theme: ThemeName, image: string | null | undefined) {
  gridEl.innerHTML = grid
    .map((home) => (home == null ? `<div class="sp-c sp-gap"></div>` : `<div class="sp-c">${tileHtml(home, theme, image)}</div>`))
    .join("");
}

export const slideGame: GameDefinition<SlideConfig> = {
  duration: () => GAME_DURATION_SECONDS.slide,
  hint: "Tap a tile next to the gap, or use arrow keys, to slide it in",
  start(stage: HTMLElement, config: SlideConfig, api: GameApi) {
    let grid = shuffle(SLIDE_SHUFFLE_MOVES[config.difficulty] ?? SLIDE_SHUFFLE_MOVES.Medium);
    let ended = false;
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timeouts.delete(id);
        fn();
      }, ms);
      timeouts.add(id);
      return id;
    };

    stage.insertAdjacentHTML("beforeend", `<div class="sp"></div>`);
    const gridEl = stage.querySelector<HTMLElement>(".sp")!;
    render(gridEl, grid, config.theme, config.image);

    function finish() {
      if (ended) return;
      ended = true;
      api.end();
    }

    function afterMove() {
      render(gridEl, grid, config.theme, config.image);
      if (!isSolved(grid)) return;
      const r = stage.getBoundingClientRect();
      api.add(300, r.width / 2, r.height / 2, "Solved! +300");
      const bonus = Math.round(api.left() * 3);
      if (bonus > 0) later(() => api.add(bonus, r.width / 2, r.height / 2 + 40, `Time bonus +${bonus}`), 250);
      gridEl.classList.add("sp-win");
      later(finish, 900);
    }

    gridEl.addEventListener("click", (e) => {
      if (ended) return;
      const cellEl = (e.target as HTMLElement).closest<HTMLElement>(".sp-c");
      if (!cellEl) return;
      const index = [...gridEl.children].indexOf(cellEl);
      if (index === -1) return;
      const r = slide(grid, index);
      if (!r.moved) return;
      grid = r.grid;
      afterMove();
    });

    const keyDir: Record<string, SlideDirection> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    const kd = (e: KeyboardEvent) => {
      if (ended) return;
      const dir = keyDir[e.key];
      if (!dir) return;
      e.preventDefault();
      const r = slideDirection(grid, dir);
      if (!r.moved) return;
      grid = r.grid;
      afterMove();
    };
    window.addEventListener("keydown", kd);

    return () => {
      ended = true;
      timeouts.forEach(clearTimeout);
      window.removeEventListener("keydown", kd);
    };
  },
};
