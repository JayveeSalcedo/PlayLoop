import { describe, expect, it } from "vitest";
import { initialState, isOpposite, placeFood, SNAKE_GRID_SIZE, SNAKE_START_LENGTH, step, type SnakeState } from "./snake";

describe("initialState", () => {
  it("starts at the configured length, moving right, with food placed off the snake", () => {
    const s = initialState(() => 0);
    expect(s.snake.length).toBe(SNAKE_START_LENGTH);
    expect(s.dir).toBe("right");
    expect(s.snake.some((p) => p.x === s.food.x && p.y === s.food.y)).toBe(false);
  });
});

describe("isOpposite", () => {
  it("catches every reversing pair", () => {
    expect(isOpposite("up", "down")).toBe(true);
    expect(isOpposite("left", "right")).toBe(true);
    expect(isOpposite("up", "left")).toBe(false);
  });
});

describe("placeFood", () => {
  it("never lands on an occupied cell", () => {
    const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
    for (let seed = 0; seed < 50; seed++) {
      const rng = () => (seed + 0.5) / 50;
      const food = placeFood(snake, rng);
      expect(snake.some((p) => p.x === food.x && p.y === food.y)).toBe(false);
    }
  });
});

describe("step", () => {
  it("moves the head one cell in the current direction and drops the tail", () => {
    const s: SnakeState = { snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], food: { x: 0, y: 0 }, dir: "right" };
    const r = step(s, null);
    expect(r.dead).toBe(false);
    expect(r.ate).toBe(false);
    expect(r.state.snake).toEqual([{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }]);
  });

  it("ignores a direction request that would reverse into itself", () => {
    const s: SnakeState = { snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], food: { x: 0, y: 0 }, dir: "right" };
    const r = step(s, "left");
    expect(r.state.dir).toBe("right");
    expect(r.state.snake[0]).toEqual({ x: 6, y: 5 });
  });

  it("grows (keeps the tail) and relocates food when eating", () => {
    const s: SnakeState = { snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], food: { x: 6, y: 5 }, dir: "right" };
    const r = step(s, null, () => 0);
    expect(r.ate).toBe(true);
    expect(r.state.snake).toEqual([{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }]);
    expect(r.state.food).not.toEqual({ x: 6, y: 5 });
  });

  it("dies on hitting a wall", () => {
    const s: SnakeState = { snake: [{ x: SNAKE_GRID_SIZE - 1, y: 5 }, { x: SNAKE_GRID_SIZE - 2, y: 5 }], food: { x: 0, y: 0 }, dir: "right" };
    const r = step(s, null);
    expect(r.dead).toBe(true);
  });

  it("dies on hitting its own body (a mid-body segment, not the vacating tail)", () => {
    // A 7-long snake curled so moving "up" runs the head into segment 5 — one
    // short of the tail (index 6), which stays put this tick since the tail
    // (index 6) is what moves away, not this one.
    const s: SnakeState = {
      snake: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
        { x: 6, y: 5 },
        { x: 6, y: 4 },
        { x: 5, y: 4 },
        { x: 4, y: 4 },
      ],
      food: { x: 0, y: 0 },
      dir: "up",
    };
    const r = step(s, null);
    expect(r.dead).toBe(true);
  });

  it("doesn't die moving into the cell its own tail is vacating", () => {
    // A 2x2 loop: head(5,5) -> (6,5) -> (6,6) -> tail(5,6). Moving "down" steps
    // the head onto the tail's current cell — legal, since the tail moves away
    // in the same tick.
    const s: SnakeState = {
      snake: [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }],
      food: { x: 0, y: 0 },
      dir: "down",
    };
    const r = step(s, null);
    expect(r.dead).toBe(false);
    expect(r.state.snake[0]).toEqual({ x: 5, y: 6 });
  });
});
