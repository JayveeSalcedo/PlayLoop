/**
 * "Merge" game template — 2048 played with icons instead of numbers, capped
 * at a 10th tier ("1024") as the win condition instead of climbing forever.
 *
 * The grid math (spawnTile/move/hasMovesLeft/hasWon) is pure and DOM-free so
 * it can be unit tested directly — see merge.test.ts — the same split
 * rules.ts uses between "what's a legal/valid play" and the DOM template.
 */
import { INK, mergeTileArt, type ThemeName } from "@playloop/ui";
import { GAME_DURATION_SECONDS, MERGE_TIME_CAP_SECONDS } from "../rules";
import type { Difficulty, GameApi, GameDefinition } from "../types";
import { escapeHtml } from "../util";

export const MERGE_GRID_SIZE = 4;
const CELL_COUNT = MERGE_GRID_SIZE * MERGE_GRID_SIZE;
/** 2, 4, 8 … 1024 — 10 tiers; tier index 0 is "2", tier 9 is "1024". Kept in sync with playRules' "merge" case and @playloop/ui's mergeTileArt/MERGE_TILE_COUNT. */
export const MERGE_WIN_TIER = 9;

/** A cell holds a tier index (0 = "2", MERGE_WIN_TIER = "1024") or null when empty. */
export type MergeCell = number | null;
export type MergeDirection = "up" | "down" | "left" | "right";

/** The point value of the tile a merge into `tier` produces (2, 4, 8 … 1024). */
export function tierValue(tier: number): number {
  return 2 ** (tier + 1);
}

export function emptyGrid(): MergeCell[] {
  return Array(CELL_COUNT).fill(null);
}

function emptyIndexes(grid: readonly MergeCell[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] == null) out.push(i);
  return out;
}

/** Drops one new tile (90% tier 0 "2", 10% tier 1 "4") into a random empty cell; no-ops on a full grid. */
export function spawnTile(grid: readonly MergeCell[], rng: () => number = Math.random): MergeCell[] {
  const free = emptyIndexes(grid);
  if (free.length === 0) return grid.slice();
  const at = free[Math.floor(rng() * free.length)]!;
  const next = grid.slice();
  next[at] = rng() < 0.9 ? 0 : 1;
  return next;
}

/** Compacts one line toward index 0, merging equal adjacent tiles once each (classic 2048 rule). */
function slideLine(line: readonly MergeCell[]): { line: MergeCell[]; gained: number } {
  const vals = line.filter((v): v is number => v != null);
  const out: MergeCell[] = [];
  let gained = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i]!;
    if (vals[i + 1] === v) {
      const merged = v + 1;
      out.push(merged);
      gained += tierValue(merged);
      i++; // the tile it merged with is consumed
    } else {
      out.push(v);
    }
  }
  while (out.length < line.length) out.push(null);
  return { line: out, gained };
}

/** The 4 flat indexes of row/column `i`, ordered so index 0 is the edge tiles slide toward. */
function lineIndexes(dir: MergeDirection, i: number): number[] {
  const n = MERGE_GRID_SIZE;
  if (dir === "left") return [0, 1, 2, 3].map((c) => i * n + c);
  if (dir === "right") return [3, 2, 1, 0].map((c) => i * n + c);
  if (dir === "up") return [0, 1, 2, 3].map((r) => r * n + i);
  return [3, 2, 1, 0].map((r) => r * n + i); // down
}

export function move(grid: readonly MergeCell[], dir: MergeDirection): { grid: MergeCell[]; gained: number; moved: boolean } {
  const next = grid.slice();
  let gained = 0;
  let moved = false;
  for (let i = 0; i < MERGE_GRID_SIZE; i++) {
    const idxs = lineIndexes(dir, i);
    const { line, gained: g } = slideLine(idxs.map((ix) => grid[ix]!));
    gained += g;
    idxs.forEach((ix, k) => {
      if (next[ix] !== line[k]) moved = true;
      next[ix] = line[k]!;
    });
  }
  return { grid: next, gained, moved };
}

export function hasMovesLeft(grid: readonly MergeCell[]): boolean {
  if (emptyIndexes(grid).length > 0) return true;
  const n = MERGE_GRID_SIZE;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = grid[r * n + c];
      if (c + 1 < n && grid[r * n + c + 1] === v) return true;
      if (r + 1 < n && grid[(r + 1) * n + c] === v) return true;
    }
  }
  return false;
}

export function hasWon(grid: readonly MergeCell[]): boolean {
  return grid.some((v) => v === MERGE_WIN_TIER);
}

export interface MergeConfig {
  difficulty: Difficulty;
  theme: ThemeName;
  /** Optional custom tier icons (data/https URLs), index-aligned 0..9 (the "2".."1024" equivalents); empty slots use the procedural default. */
  icons?: (string | null)[];
}

function tileHtml(tier: MergeCell, theme: ThemeName, icons: (string | null)[] | undefined) {
  if (tier == null) return `<div class="mg-c"></div>`;
  const custom = icons?.[tier];
  const face = custom ? `<img src="${escapeHtml(custom)}" alt="">` : mergeTileArt(tier, theme);
  const win = tier === MERGE_WIN_TIER ? " mg-win" : "";
  return `<div class="mg-c"><div class="mg-t${win}" style="--mg-ink:${INK}">${face}</div></div>`;
}

function render(gridEl: HTMLElement, grid: readonly MergeCell[], theme: ThemeName, icons: (string | null)[] | undefined) {
  gridEl.innerHTML = grid.map((c) => tileHtml(c, theme, icons)).join("");
}

export const mergeGame: GameDefinition<MergeConfig> = {
  duration: () => GAME_DURATION_SECONDS.merge,
  hint: "Swipe or use arrow keys — merge matching tiles up to the top",
  start(stage: HTMLElement, config: MergeConfig, api: GameApi) {
    let grid = spawnTile(spawnTile(emptyGrid()));
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

    stage.insertAdjacentHTML("beforeend", `<div class="mg"></div>`);
    const gridEl = stage.querySelector<HTMLElement>(".mg")!;
    render(gridEl, grid, config.theme, config.icons);

    later(() => finish(), MERGE_TIME_CAP_SECONDS * 1000);

    function finish() {
      if (ended) return;
      ended = true;
      api.end();
    }

    function afterMove(gained: number) {
      if (gained > 0) {
        const r = stage.getBoundingClientRect();
        api.add(gained, r.width / 2, r.height / 2, `+${gained}`);
      }
      grid = spawnTile(grid);
      render(gridEl, grid, config.theme, config.icons);
      if (hasWon(grid)) {
        later(finish, 700); // let the winning tile land on screen before ending
      } else if (!hasMovesLeft(grid)) {
        finish();
      }
    }

    function attempt(dir: MergeDirection) {
      if (ended) return;
      const r = move(grid, dir);
      if (!r.moved) return;
      grid = r.grid;
      afterMove(r.gained);
    }

    const keyDir: Record<string, MergeDirection> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    const kd = (e: KeyboardEvent) => {
      const dir = keyDir[e.key];
      if (!dir) return;
      e.preventDefault();
      attempt(dir);
    };
    window.addEventListener("keydown", kd);

    const SWIPE_MIN_PX = 24;
    let sx = 0;
    let sy = 0;
    let tracking = false;
    const pd = (e: PointerEvent) => {
      tracking = true;
      sx = e.clientX;
      sy = e.clientY;
    };
    const pu = (e: PointerEvent) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.abs(dx) < SWIPE_MIN_PX && Math.abs(dy) < SWIPE_MIN_PX) return;
      attempt(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    };
    stage.addEventListener("pointerdown", pd);
    stage.addEventListener("pointerup", pu);

    return () => {
      ended = true;
      timeouts.forEach(clearTimeout);
      window.removeEventListener("keydown", kd);
      stage.removeEventListener("pointerdown", pd);
      stage.removeEventListener("pointerup", pu);
    };
  },
};
