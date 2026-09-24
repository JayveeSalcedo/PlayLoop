import { describe, expect, it } from "vitest";
import { aiMove, emptyBoard, isDraw, legalMoves, winner, winningLine, type Board } from "./tictactoe";

function board(cells: Board): Board {
  expect(cells.length).toBe(9);
  return cells;
}

describe("winner / winningLine", () => {
  it("detects a row win", () => {
    const b = board(["X", "X", "X", null, "O", "O", null, null, null]);
    expect(winner(b)).toBe("X");
    expect(winningLine(b)).toEqual([0, 1, 2]);
  });

  it("detects a column win", () => {
    const b = board(["O", "X", null, "O", "X", null, "O", null, "X"]);
    expect(winner(b)).toBe("O");
    expect(winningLine(b)).toEqual([0, 3, 6]);
  });

  it("detects a diagonal win", () => {
    const b = board(["X", "O", null, "O", "X", null, null, null, "X"]);
    expect(winner(b)).toBe("X");
    expect(winningLine(b)).toEqual([0, 4, 8]);
  });

  it("returns null on an empty or in-progress board", () => {
    expect(winner(emptyBoard())).toBeNull();
    expect(winningLine(emptyBoard())).toBeNull();
  });
});

describe("isDraw", () => {
  it("is true on a full board with no winner", () => {
    const b = board(["X", "O", "X", "X", "O", "O", "O", "X", "X"]);
    expect(winner(b)).toBeNull();
    expect(isDraw(b)).toBe(true);
  });

  it("is false while cells remain, or once someone has won", () => {
    expect(isDraw(emptyBoard())).toBe(false);
    expect(isDraw(board(["X", "X", "X", null, "O", "O", null, null, null]))).toBe(false);
  });
});

describe("legalMoves", () => {
  it("lists only empty cells", () => {
    const b = board(["X", null, "O", null, null, null, null, null, null]);
    expect(legalMoves(b)).toEqual([1, 3, 4, 5, 6, 7, 8]);
  });
});

describe("aiMove", () => {
  it("Easy picks some legal move", () => {
    const b = emptyBoard();
    const m = aiMove(b, "O", "X", "Easy", () => 0.5);
    expect(legalMoves(b)).toContain(m);
  });

  it("Medium takes an immediate win over anything else", () => {
    // O has two in a row (0,1); taking 2 wins immediately.
    const b = board(["O", "O", null, "X", "X", null, null, null, null]);
    expect(aiMove(b, "O", "X", "Medium")).toBe(2);
  });

  it("Medium blocks the human's immediate winning move when it can't win itself", () => {
    // X has two in a row (0,1); O must block at 2.
    const b = board(["X", "X", null, "O", null, null, null, null, null]);
    expect(aiMove(b, "O", "X", "Medium")).toBe(2);
  });

  it("Hard (minimax) never loses from an empty board across every human opening", () => {
    for (let opening = 0; opening < 9; opening++) {
      let b = emptyBoard();
      b = b.slice();
      b[opening] = "X";
      let turn: "X" | "O" = "O";
      let guard = 0;
      while (!winner(b) && !isDraw(b) && guard++ < 9) {
        if (turn === "O") {
          const m = aiMove(b, "O", "X", "Hard");
          b = b.slice();
          b[m] = "O";
        } else {
          // Human plays the first available cell — not optimal, just needs to never beat a perfect O.
          const m = legalMoves(b)[0]!;
          b = b.slice();
          b[m] = "X";
        }
        turn = turn === "O" ? "X" : "O";
      }
      expect(winner(b)).not.toBe("X");
    }
  });
});
