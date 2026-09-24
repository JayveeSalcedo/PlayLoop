/**
 * "Snake" game template — classic rules: eat food to grow, die on hitting a
 * wall or your own tail. Swipe or arrow keys steer; speed ramps up slightly
 * as the snake grows.
 *
 * The grid math (initialState/step/placeFood) is pure and DOM-free so it can
 * be unit tested directly — see snake.test.ts — same split rules.ts uses
 * between "what's a legal/valid play" and the template.
 */
import { INK, itemShape, THEMES, type ItemKind, type ThemeName } from "@playloop/ui";
import { GAME_DURATION_SECONDS, SNAKE_TIME_CAP_SECONDS, SPEED_BY_DIFFICULTY } from "../rules";
import type { Difficulty, GameApi, GameDefinition } from "../types";

export const SNAKE_GRID_SIZE = 14;
export const SNAKE_START_LENGTH = 3;
export const SNAKE_FOOD_POINTS = 10;

export type SnakeDirection = "up" | "down" | "left" | "right";
export interface Point {
  x: number;
  y: number;
}
export interface SnakeState {
  snake: Point[]; // head first
  food: Point;
  dir: SnakeDirection;
}

const OPPOSITE: Record<SnakeDirection, SnakeDirection> = { up: "down", down: "up", left: "right", right: "left" };

export function isOpposite(a: SnakeDirection, b: SnakeDirection): boolean {
  return OPPOSITE[a] === b;
}

/** Picks a random cell not occupied by the snake. Falls back to the head (unreachable in practice) if the grid is somehow full. */
export function placeFood(snake: readonly Point[], rng: () => number = Math.random): Point {
  const occupied = new Set(snake.map((p) => `${p.x},${p.y}`));
  const free: Point[] = [];
  for (let y = 0; y < SNAKE_GRID_SIZE; y++) {
    for (let x = 0; x < SNAKE_GRID_SIZE; x++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return snake[0]!;
  return free[Math.floor(rng() * free.length)]!;
}

export function initialState(rng: () => number = Math.random): SnakeState {
  const cy = Math.floor(SNAKE_GRID_SIZE / 2);
  const cx = Math.floor(SNAKE_GRID_SIZE / 2);
  const snake: Point[] = Array.from({ length: SNAKE_START_LENGTH }, (_, i) => ({ x: cx - i, y: cy }));
  return { snake, food: placeFood(snake, rng), dir: "right" };
}

export interface StepResult {
  state: SnakeState;
  ate: boolean;
  dead: boolean;
}

/** Advances one tick. `requestedDir` is ignored if it would reverse the snake into itself. */
export function step(state: SnakeState, requestedDir: SnakeDirection | null, rng: () => number = Math.random): StepResult {
  const dir = requestedDir && !isOpposite(requestedDir, state.dir) ? requestedDir : state.dir;
  const head = state.snake[0]!;
  const delta = dir === "up" ? { x: 0, y: -1 } : dir === "down" ? { x: 0, y: 1 } : dir === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 };
  const next = { x: head.x + delta.x, y: head.y + delta.y };

  const hitWall = next.x < 0 || next.x >= SNAKE_GRID_SIZE || next.y < 0 || next.y >= SNAKE_GRID_SIZE;
  const ate = !hitWall && next.x === state.food.x && next.y === state.food.y;
  // The tail cell is vacated this tick unless the snake is growing (ate), so
  // it's safe to move into — exclude it from the self-collision check.
  const body = ate ? state.snake : state.snake.slice(0, -1);
  const hitSelf = !hitWall && body.some((p) => p.x === next.x && p.y === next.y);

  if (hitWall || hitSelf) {
    return { state: { ...state, dir }, ate: false, dead: true };
  }

  const snake = [next, ...body];
  const food = ate ? placeFood(snake, rng) : state.food;
  return { state: { snake, food, dir }, ate, dead: false };
}

export interface SnakeConfig {
  difficulty: Difficulty;
  theme: ThemeName;
  /** The food pellet's shape — reuses Catch's item set rather than a new upload flow. */
  item: ItemKind;
}

function render(gridEl: HTMLElement, state: SnakeState, colors: [string, string], foodSvg: string) {
  const kindAt = new Map<string, "head" | "body">();
  state.snake.forEach((p, i) => kindAt.set(`${p.x},${p.y}`, i === 0 ? "head" : "body"));
  const cells: string[] = [];
  for (let y = 0; y < SNAKE_GRID_SIZE; y++) {
    for (let x = 0; x < SNAKE_GRID_SIZE; x++) {
      const kind = kindAt.get(`${x},${y}`);
      if (kind === "head") {
        cells.push(`<div class="sk-c"><div class="sk-head" style="background:${colors[1]}"></div></div>`);
      } else if (kind === "body") {
        cells.push(`<div class="sk-c"><div class="sk-body" style="background:${colors[0]}"></div></div>`);
      } else if (state.food.x === x && state.food.y === y) {
        cells.push(`<div class="sk-c"><div class="sk-food"><svg viewBox="-20 -20 40 40">${foodSvg}</svg></div></div>`);
      } else {
        cells.push(`<div class="sk-c"></div>`);
      }
    }
  }
  gridEl.innerHTML = cells.join("");
}

export const snakeGame: GameDefinition<SnakeConfig> = {
  duration: () => GAME_DURATION_SECONDS.snake,
  hint: "Swipe or use arrow keys — eat the food, don't hit the wall or yourself",
  start(stage: HTMLElement, config: SnakeConfig, api: GameApi) {
    const sp = SPEED_BY_DIFFICULTY[config.difficulty] ?? 1;
    const [a, b] = THEMES[config.theme] || THEMES.neon!;

    let state = initialState();
    let pendingDir: SnakeDirection | null = null;
    let ended = false;
    let score = 0;
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timeouts.delete(id);
        fn();
      }, ms);
      timeouts.add(id);
      return id;
    };

    stage.insertAdjacentHTML("beforeend", `<div class="sk" style="grid-template-columns:repeat(${SNAKE_GRID_SIZE},1fr);grid-template-rows:repeat(${SNAKE_GRID_SIZE},1fr)"></div>`);
    const gridEl = stage.querySelector<HTMLElement>(".sk")!;

    const foodSvg = itemShape(config.item, 0, 0, 1.3);
    function draw() {
      render(gridEl, state, [a, b], foodSvg);
    }
    draw();

    later(() => finish(), SNAKE_TIME_CAP_SECONDS * 1000);

    function finish() {
      if (ended) return;
      ended = true;
      api.end();
    }

    let tickId: ReturnType<typeof setTimeout>;
    function tick() {
      if (ended) return;
      const r = step(state, pendingDir);
      pendingDir = null;
      state = r.state;
      if (r.dead) {
        gridEl.classList.add("sk-dead");
        draw();
        later(finish, 500);
        return;
      }
      if (r.ate) {
        score += SNAKE_FOOD_POINTS;
        const cell = gridEl.children[state.snake[0]!.y * SNAKE_GRID_SIZE + state.snake[0]!.x];
        const rect = cell?.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        if (rect) api.add(SNAKE_FOOD_POINTS, rect.left - stageRect.left + rect.width / 2, rect.top - stageRect.top + rect.height / 2);
        else api.add(SNAKE_FOOD_POINTS);
      }
      draw();
      const interval = Math.max(80, 220 - state.snake.length * 3) / sp;
      tickId = later(tick, interval);
    }
    tickId = later(tick, Math.max(80, 220) / sp);

    function setDir(dir: SnakeDirection) {
      if (!ended) pendingDir = dir;
    }

    const keyDir: Record<string, SnakeDirection> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    const kd = (e: KeyboardEvent) => {
      const dir = keyDir[e.key];
      if (!dir) return;
      e.preventDefault();
      setDir(dir);
    };
    window.addEventListener("keydown", kd);

    const SWIPE_MIN_PX = 20;
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
      setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    };
    stage.addEventListener("pointerdown", pd);
    stage.addEventListener("pointerup", pu);

    return () => {
      ended = true;
      clearTimeout(tickId);
      timeouts.forEach(clearTimeout);
      window.removeEventListener("keydown", kd);
      stage.removeEventListener("pointerdown", pd);
      stage.removeEventListener("pointerup", pu);
    };
  },
};
