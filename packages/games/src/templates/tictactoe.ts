/**
 * "Tic-Tac-Toe" game template — solo vs. a computer opponent, since this
 * platform's scoring model is one player, one session, one score (no
 * local-multiplayer or matchmaking exists yet). The player is always X and
 * always moves first; difficulty controls how well O plays.
 *
 * The board math (winner/isDraw/aiMove) is pure and DOM-free so it can be
 * unit tested directly — see tictactoe.test.ts — same split rules.ts uses
 * between "what's a legal/valid play" and the template.
 */
import { THEMES, type ThemeName } from "@playloop/ui";
import { GAME_DURATION_SECONDS, TICTACTOE_TIME_CAP_SECONDS } from "../rules";
import type { Difficulty, GameApi, GameDefinition } from "../types";

export type Mark = "X" | "O" | null;
export type Board = Mark[]; // length 9, index = row * 3 + col

export const WIN_POINTS = 300;
export const DRAW_POINTS = 100;

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

export function emptyBoard(): Board {
  return Array(9).fill(null);
}

export function legalMoves(board: readonly Mark[]): number[] {
  const moves: number[] = [];
  board.forEach((v, i) => {
    if (v == null) moves.push(i);
  });
  return moves;
}

/** The completed line (as 3 board indexes) if someone has won, else null. */
export function winningLine(board: readonly Mark[]): readonly number[] | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
  }
  return null;
}

export function winner(board: readonly Mark[]): Mark {
  const line = winningLine(board);
  return line ? board[line[0]!]! : null;
}

export function isDraw(board: readonly Mark[]): boolean {
  return !winner(board) && board.every((c) => c != null);
}

function other(mark: NonNullable<Mark>): NonNullable<Mark> {
  return mark === "X" ? "O" : "X";
}

/** Minimax score of `board` from `turn`'s perspective, relative to `ai`. Tiny game tree (<=9!), no pruning needed. */
function minimax(board: Board, turn: NonNullable<Mark>, ai: NonNullable<Mark>, human: NonNullable<Mark>): number {
  const w = winner(board);
  if (w === ai) return 10;
  if (w === human) return -10;
  if (isDraw(board)) return 0;
  const scores = legalMoves(board).map((m) => {
    const next = board.slice();
    next[m] = turn;
    return minimax(next, other(turn), ai, human);
  });
  return turn === ai ? Math.max(...scores) : Math.min(...scores);
}

/** Picks O's move for the given difficulty. Easy: random. Medium: win-if-possible, else block, else random. Hard: minimax (never loses). */
export function aiMove(board: Board, ai: NonNullable<Mark>, human: NonNullable<Mark>, difficulty: Difficulty, rng: () => number = Math.random): number {
  const moves = legalMoves(board);
  if (difficulty === "Easy") return moves[Math.floor(rng() * moves.length)]!;

  if (difficulty === "Medium") {
    for (const m of moves) {
      const next = board.slice();
      next[m] = ai;
      if (winner(next) === ai) return m;
    }
    for (const m of moves) {
      const next = board.slice();
      next[m] = human;
      if (winner(next) === human) return m;
    }
    return moves[Math.floor(rng() * moves.length)]!;
  }

  let best = moves[0]!;
  let bestScore = -Infinity;
  for (const m of moves) {
    const next = board.slice();
    next[m] = ai;
    const score = minimax(next, human, ai, human);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

export interface TicTacToeConfig {
  difficulty: Difficulty;
  theme: ThemeName;
}

/** The computer opponent's mark color — deliberately fixed (not theme-driven), so O always reads as "the other side" regardless of the game's theme. */
const OPPONENT_COLOR = "#E5484D";

function markSvg(mark: NonNullable<Mark>, color: string): string {
  if (mark === "X") {
    return `<svg viewBox="-20 -20 40 40"><path d="M-12-12 12 12M12-12-12 12" stroke="${color}" stroke-width="5" stroke-linecap="round"/></svg>`;
  }
  return `<svg viewBox="-20 -20 40 40"><circle r="12" fill="none" stroke="${color}" stroke-width="5"/></svg>`;
}

function render(gridEl: HTMLElement, board: readonly Mark[], colors: [string, string], winLine: readonly number[] | null) {
  gridEl.innerHTML = board
    .map((mark, i) => {
      const win = winLine?.includes(i) ? " ttt-win" : "";
      const inner = mark ? markSvg(mark, mark === "X" ? colors[1] : OPPONENT_COLOR) : "";
      return `<button class="ttt-c${win}" type="button" data-i="${i}" aria-label="Cell ${i + 1}" ${mark ? "disabled" : ""}>${inner}</button>`;
    })
    .join("");
}

export const tictactoeGame: GameDefinition<TicTacToeConfig> = {
  duration: () => GAME_DURATION_SECONDS.tictactoe,
  hint: "Tap a cell — you're X, first to three in a row wins",
  start(stage: HTMLElement, config: TicTacToeConfig, api: GameApi) {
    const [a, b] = THEMES[config.theme] || THEMES.neon!;
    let board = emptyBoard();
    let ended = false;
    let playerTurn = true;
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timeouts.delete(id);
        fn();
      }, ms);
      timeouts.add(id);
      return id;
    };

    stage.insertAdjacentHTML("beforeend", `<div class="ttt"></div>`);
    const gridEl = stage.querySelector<HTMLElement>(".ttt")!;
    const draw = () => render(gridEl, board, [a, b], winningLine(board));
    draw();

    later(() => finish(), TICTACTOE_TIME_CAP_SECONDS * 1000);

    function finish() {
      if (ended) return;
      ended = true;
      api.end();
    }

    function resolveIfOver(): boolean {
      const w = winner(board);
      if (w) {
        draw();
        const r = stage.getBoundingClientRect();
        if (w === "X") api.add(WIN_POINTS, r.width / 2, r.height / 2, `You win! +${WIN_POINTS}`);
        later(finish, 900);
        return true;
      }
      if (isDraw(board)) {
        draw();
        const r = stage.getBoundingClientRect();
        api.add(DRAW_POINTS, r.width / 2, r.height / 2, `Draw +${DRAW_POINTS}`);
        later(finish, 900);
        return true;
      }
      return false;
    }

    function aiTurn() {
      playerTurn = false;
      draw();
      later(() => {
        if (ended) return;
        const move = aiMove(board, "O", "X", config.difficulty);
        board = board.slice();
        board[move] = "O";
        if (!resolveIfOver()) {
          playerTurn = true;
          draw();
        }
      }, 420);
    }

    gridEl.addEventListener("click", (e) => {
      if (ended || !playerTurn) return;
      const cell = (e.target as HTMLElement).closest<HTMLButtonElement>(".ttt-c");
      if (!cell) return;
      const i = Number(cell.dataset.i);
      if (board[i] != null) return;
      board = board.slice();
      board[i] = "X";
      if (!resolveIfOver()) aiTurn();
    });

    return () => {
      ended = true;
      timeouts.forEach(clearTimeout);
    };
  },
};
