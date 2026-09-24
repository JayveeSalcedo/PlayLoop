import { describe, expect, it } from "vitest";
import { gapIndexOf, isSolved, shuffle, slide, slideDirection, solvedGrid, SLIDE_GRID_SIZE, type SlideCell } from "./slide";

function grid(cells: (number | null)[]): SlideCell[] {
  expect(cells.length).toBe(SLIDE_GRID_SIZE * SLIDE_GRID_SIZE);
  return cells;
}

describe("solvedGrid / isSolved", () => {
  it("the solved grid is solved, with the gap last", () => {
    const g = solvedGrid();
    expect(isSolved(g)).toBe(true);
    expect(gapIndexOf(g)).toBe(8);
  });

  it("any out-of-place tile is not solved", () => {
    const g = grid([0, 1, 2, 3, 4, 5, 6, null, 7]);
    expect(isSolved(g)).toBe(false);
  });
});

describe("slide", () => {
  it("slides an adjacent tile into the gap", () => {
    // gap at 8 (bottom-right); tile 7 (bottom-middle) is adjacent.
    const r = slide(solvedGrid(), 7);
    expect(r.moved).toBe(true);
    expect(r.grid[8]).toBe(7);
    expect(r.grid[7]).toBeNull();
  });

  it("refuses to slide a non-adjacent tile", () => {
    // gap at 8; tile 0 (top-left) is not adjacent.
    const r = slide(solvedGrid(), 0);
    expect(r.moved).toBe(false);
    expect(r.grid).toEqual(solvedGrid());
  });
});

describe("slideDirection", () => {
  it("'up' slides the tile below the gap upward", () => {
    // gap at 8 (row 2, col 2); the tile below in grid terms doesn't exist (gap
    // is already on the bottom row) so use a gap in the middle instead.
    const g = grid([0, 1, 2, 3, null, 5, 6, 4, 7]); // gap at index 4
    const r = slideDirection(g, "up");
    expect(r.moved).toBe(true);
    // tile that was below the gap (index 7, value 4) moves up into index 4.
    expect(r.grid[4]).toBe(4);
    expect(r.grid[7]).toBeNull();
  });

  it("reports moved:false when there's no tile on the far side of the gap to pull from", () => {
    const g = solvedGrid(); // gap at bottom-right corner (8): no row below, no column to the right
    expect(slideDirection(g, "up").moved).toBe(false); // "up" needs a tile below the gap to pull up
    expect(slideDirection(g, "left").moved).toBe(false); // "left" needs a tile right of the gap to pull left
    expect(slideDirection(g, "down").moved).toBe(true); // there IS a tile above the gap to pull down
    expect(slideDirection(g, "right").moved).toBe(true); // there IS a tile left of the gap to pull right
  });
});

describe("shuffle", () => {
  it("always produces a solvable board (reachable by undoing the shuffle)", () => {
    for (let seed = 0; seed < 20; seed++) {
      let s = seed;
      const rng = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return (s % 10000) / 10000;
      };
      const scrambled = shuffle(60, rng);
      // A board reached by legal slides from the solved state is solvable by
      // definition; sanity-check it's actually scrambled (not a no-op run).
      expect(scrambled).not.toEqual(solvedGrid());
      expect(scrambled.filter((c) => c == null).length).toBe(1);
      expect(new Set(scrambled.filter((c): c is number => c != null)).size).toBe(8);
    }
  });

  it("moves:0 leaves the board solved", () => {
    expect(shuffle(0)).toEqual(solvedGrid());
  });
});
