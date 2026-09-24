import { describe, expect, it } from "vitest";
import {
  emptyGrid,
  hasMovesLeft,
  hasWon,
  move,
  MERGE_GRID_SIZE,
  MERGE_WIN_TIER,
  spawnTile,
  tierValue,
  type MergeCell,
} from "./merge";

function grid(cells: (number | null)[]): MergeCell[] {
  expect(cells.length).toBe(MERGE_GRID_SIZE * MERGE_GRID_SIZE);
  return cells;
}

describe("tierValue", () => {
  it("maps tier 0 to 2 and the win tier to 1024", () => {
    expect(tierValue(0)).toBe(2);
    expect(tierValue(MERGE_WIN_TIER)).toBe(1024);
  });
});

describe("spawnTile", () => {
  it("adds exactly one tile to an empty grid", () => {
    const g = spawnTile(emptyGrid(), () => 0);
    expect(g.filter((c) => c != null).length).toBe(1);
    expect(g[0]).toBe(0); // rng() => 0 picks the first empty cell and the 90% branch
  });

  it("no-ops on a full grid", () => {
    const full = grid(Array(16).fill(0));
    expect(spawnTile(full)).toEqual(full);
  });
});

describe("move", () => {
  it("slides and merges a row to the left", () => {
    // 2 2 . . -> 4 . . .
    const g = grid([0, 0, null, null, ...Array(12).fill(null)]);
    const r = move(g, "left");
    expect(r.moved).toBe(true);
    expect(r.gained).toBe(4);
    expect(r.grid.slice(0, 4)).toEqual([1, null, null, null]);
  });

  it("merges only one pair per move, leftover tile stays", () => {
    // 2 2 2 . -> 4 2 . .
    const g = grid([0, 0, 0, null, ...Array(12).fill(null)]);
    const r = move(g, "left");
    expect(r.gained).toBe(4);
    expect(r.grid.slice(0, 4)).toEqual([1, 0, null, null]);
  });

  it("merges two pairs independently in a full row", () => {
    // 2 2 2 2 -> 4 4 . .
    const g = grid([0, 0, 0, 0, ...Array(12).fill(null)]);
    const r = move(g, "left");
    expect(r.gained).toBe(8);
    expect(r.grid.slice(0, 4)).toEqual([1, 1, null, null]);
  });

  it("slides right toward the far edge", () => {
    const g = grid([0, 0, null, null, ...Array(12).fill(null)]);
    const r = move(g, "right");
    expect(r.grid.slice(0, 4)).toEqual([null, null, null, 1]);
  });

  it("slides up a column toward row 0", () => {
    const cells = Array(16).fill(null) as (number | null)[];
    cells[0 * 4] = 0; // row 0, col 0
    cells[2 * 4] = 0; // row 2, col 0
    const r = move(grid(cells), "up");
    expect(r.grid[0]).toBe(1);
    expect(r.grid[4]).toBeNull();
    expect(r.grid[8]).toBeNull();
  });

  it("slides down a column toward row 3", () => {
    const cells = Array(16).fill(null) as (number | null)[];
    cells[0 * 4] = 0;
    cells[2 * 4] = 0;
    const r = move(grid(cells), "down");
    expect(r.grid[12]).toBe(1);
  });

  it("reports moved:false when nothing can shift", () => {
    const g = grid(Array(16).fill(null));
    const r = move(g, "left");
    expect(r.moved).toBe(false);
    expect(r.gained).toBe(0);
  });
});

describe("hasMovesLeft", () => {
  it("is true with any empty cell", () => {
    expect(hasMovesLeft(grid(Array(16).fill(null)))).toBe(true);
  });

  it("is true when a full board still has an adjacent equal pair", () => {
    const cells = Array.from({ length: 16 }, (_, i) => i % 2) as number[];
    cells[0] = 0;
    cells[1] = 0; // force one adjacent equal pair
    expect(hasMovesLeft(grid(cells))).toBe(true);
  });

  it("is false on a full board with no adjacent equal pairs", () => {
    // True checkerboard by (row+col) parity — flat-index parity alone repeats
    // per column since the grid width (4) is even, which leaves a false
    // vertical match at every column boundary between rows.
    const cells = Array.from({ length: 16 }, (_, i) => (Math.floor(i / 4) + (i % 4)) % 2);
    expect(hasMovesLeft(grid(cells))).toBe(false);
  });
});

describe("hasWon", () => {
  it("is true once any cell reaches the win tier", () => {
    const cells = Array(16).fill(null) as (number | null)[];
    cells[5] = MERGE_WIN_TIER;
    expect(hasWon(grid(cells))).toBe(true);
  });

  it("is false otherwise", () => {
    expect(hasWon(grid(Array(16).fill(null)))).toBe(false);
  });
});
