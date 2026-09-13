import { describe, expect, it } from "vitest";
import * as dm from "../src/detmath";
import { createRng } from "../src/rng";

const close = (a: number, b: number, tol = 1e-9) => {
  if (Number.isNaN(b)) return Number.isNaN(a);
  if (!Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
};

function samples(lo: number, hi: number, n = 4000): number[] {
  const rnd = createRng(`detmath:${lo}:${hi}`);
  const out = [lo, hi, 0, (lo + hi) / 2];
  for (let i = 0; i < n; i++) out.push(lo + rnd() * (hi - lo));
  return out.filter((v) => v >= lo && v <= hi);
}

describe("deterministic math matches native within 1e-9", () => {
  const unary: [keyof typeof dm, (x: number) => number, number, number][] = [
    ["sin", Math.sin, -200, 200],
    ["cos", Math.cos, -200, 200],
    ["tan", Math.tan, -1.5, 1.5],
    ["atan", Math.atan, -1e6, 1e6],
    ["asin", Math.asin, -1, 1],
    ["acos", Math.acos, -1, 1],
    ["exp", Math.exp, -700, 700],
    ["log", Math.log, 1e-300, 1e300],
    ["cbrt", Math.cbrt, -1e9, 1e9],
    ["tanh", Math.tanh, -30, 30],
    ["log2", Math.log2, 1e-10, 1e10],
    ["log10", Math.log10, 1e-10, 1e10],
  ];

  for (const [name, native, lo, hi] of unary) {
    it(name, () => {
      const fn = dm[name] as (x: number) => number;
      for (const x of samples(lo, hi)) {
        if (!close(fn(x), native(x))) throw new Error(`${name}(${x}) = ${fn(x)}, native ${native(x)}`);
      }
    });
  }

  it("atan2 across all quadrants", () => {
    const xs = samples(-500, 500, 400);
    const ys = samples(-500, 500, 400);
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i]!;
      const y = ys[i % ys.length]!;
      expect(close(dm.atan2(y, x), Math.atan2(y, x))).toBe(true);
    }
    expect(dm.atan2(1, 0)).toBeCloseTo(Math.PI / 2, 15);
    expect(dm.atan2(-1, 0)).toBeCloseTo(-Math.PI / 2, 15);
  });

  it("pow for integer and fractional exponents", () => {
    for (const b of samples(0.001, 50, 500)) {
      for (const e of [-3, -1, 0, 1, 2, 5, 0.5, 1.5, -0.25, 2.2]) {
        expect(close(dm.pow(b, e), Math.pow(b, e))).toBe(true);
      }
    }
    expect(dm.pow(-2, 3)).toBe(-8);
    expect(Number.isNaN(dm.pow(-2, 0.5))).toBe(true);
    expect(dm.pow(0, -1)).toBe(Infinity);
    expect(dm.pow(2, Infinity)).toBe(Infinity);
  });

  it("special values", () => {
    expect(Number.isNaN(dm.sin(Infinity))).toBe(true);
    expect(dm.exp(1000)).toBe(Infinity);
    expect(dm.exp(-1000)).toBe(0);
    expect(dm.log(0)).toBe(-Infinity);
    expect(Number.isNaN(dm.log(-1))).toBe(true);
    expect(dm.hypot(3, 4)).toBe(5);
  });
});
