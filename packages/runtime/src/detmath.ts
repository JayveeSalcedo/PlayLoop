/**
 * Deterministic replacements for the transcendental Math functions.
 *
 * ECMAScript leaves Math.sin, Math.exp, Math.pow and friends
 * "implementation-approximated", so V8 (the player's browser) and QuickJS
 * (the server replay) are allowed to disagree in the last bits, and one
 * flipped bit in a collision check is enough to diverge a replay. Everything
 * here is built only from + - * /, comparisons, and the operations the spec
 * does pin down exactly (floor, round, abs, sqrt, imul...), so both engines
 * compute identical doubles. Accuracy is ~1e-12, which no game can see.
 *
 * Fixed iteration counts everywhere: the point is identical results, not speed.
 */

const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;
const LN2 = 0.6931471805599453;
const LN10 = 2.302585092994046;
const SQRT3 = 1.7320508075688772;
const TAN_15_DEG = 0.2679491924311227;
const SQRT_HALF = 0.7071067811865476;
const SQRT_TWO = 1.4142135623730951;
const TWO_POW_30 = 1073741824;

const nativeFloor = Math.floor;
const nativeRound = Math.round;
const nativeSqrt = Math.sqrt;
const nativePow = Math.pow;

const isFiniteNumber = (x: number) => x === x && x !== Infinity && x !== -Infinity;

/** Wraps any finite angle into [-π, π]. */
function wrapAngle(x: number): number {
  let r = x - nativeFloor(x / TWO_PI) * TWO_PI;
  if (r > PI) r -= TWO_PI;
  return r;
}

/** Taylor series through r^17; |r| ≤ π/2 keeps the error under 1e-13. */
function sinSeries(r: number): number {
  const r2 = r * r;
  let term = r;
  let sum = r;
  for (let n = 1; n <= 8; n++) {
    term *= -r2 / (2 * n * (2 * n + 1));
    sum += term;
  }
  return sum;
}

/** Taylor series through r^18; |r| ≤ π/2. */
function cosSeries(r: number): number {
  const r2 = r * r;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 9; n++) {
    term *= -r2 / ((2 * n - 1) * (2 * n));
    sum += term;
  }
  return sum;
}

export function sin(x: number): number {
  if (!isFiniteNumber(x)) return NaN;
  let r = wrapAngle(x);
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  return sinSeries(r);
}

export function cos(x: number): number {
  if (!isFiniteNumber(x)) return NaN;
  const r = wrapAngle(x);
  const a = r < 0 ? -r : r;
  return a > HALF_PI ? -cosSeries(PI - a) : cosSeries(a);
}

export function tan(x: number): number {
  return sin(x) / cos(x);
}

/** Series for |x| ≤ tan(15°); 16 terms leaves the error far below 1e-15. */
function atanSmall(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < 16; n++) {
    term *= -x2;
    sum += term / (2 * n + 1);
  }
  return sum;
}

export function atan(x: number): number {
  if (x !== x) return NaN;
  if (x === Infinity) return HALF_PI;
  if (x === -Infinity) return -HALF_PI;
  if (x < 0) return -atan(-x);
  if (x > 1) return HALF_PI - atan(1 / x);
  if (x > TAN_15_DEG) return PI / 6 + atanSmall((x * SQRT3 - 1) / (x + SQRT3));
  return atanSmall(x);
}

export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

export function asin(x: number): number {
  if (!(x >= -1 && x <= 1)) return NaN;
  return atan2(x, nativeSqrt(1 - x * x));
}

export function acos(x: number): number {
  if (!(x >= -1 && x <= 1)) return NaN;
  return atan2(nativeSqrt(1 - x * x), x);
}

/** v × 2^k using only exact doublings/halvings. */
function scaleByPowerOfTwo(v: number, k: number): number {
  while (k > 30) {
    v *= TWO_POW_30;
    k -= 30;
  }
  while (k < -30) {
    v /= TWO_POW_30;
    k += 30;
  }
  return k >= 0 ? v * (1 << k) : v / (1 << -k);
}

export function exp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019412) return 0;
  const k = nativeRound(x / LN2);
  const r = x - k * LN2; // |r| ≤ ~0.35
  let term = 1;
  let sum = 1;
  for (let n = 1; n < 22; n++) {
    term *= r / n;
    sum += term;
  }
  return scaleByPowerOfTwo(sum, k);
}

export function log(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let m = x;
  let e = 0;
  while (m >= TWO_POW_30) {
    m /= TWO_POW_30;
    e += 30;
  }
  while (m < 1 / TWO_POW_30) {
    m *= TWO_POW_30;
    e -= 30;
  }
  while (m > SQRT_TWO) {
    m /= 2;
    e += 1;
  }
  while (m < SQRT_HALF) {
    m *= 2;
    e -= 1;
  }
  // log(m) = 2·atanh(s), |s| ≤ 0.172
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let term = s;
  let sum = s;
  for (let n = 1; n < 18; n++) {
    term *= s2;
    sum += term / (2 * n + 1);
  }
  return e * LN2 + 2 * sum;
}

export function pow(base: number, exponent: number): number {
  // Non-finite inputs and NaN have exactly specified results; defer to native.
  if (!isFiniteNumber(base) || !isFiniteNumber(exponent)) return nativePow(base, exponent);
  if (exponent === 0) return 1;
  if (base === 1) return 1;
  if (exponent === nativeFloor(exponent) && exponent <= 1024 && exponent >= -1024) {
    let e = exponent < 0 ? -exponent : exponent;
    let b = base;
    let result = 1;
    while (e > 0) {
      if (e % 2 === 1) result *= b;
      b *= b;
      e = nativeFloor(e / 2);
    }
    return exponent < 0 ? 1 / result : result;
  }
  if (base === 0) return exponent > 0 ? 0 : Infinity;
  if (base < 0) return NaN;
  return exp(exponent * log(base));
}

export function cbrt(x: number): number {
  if (!isFiniteNumber(x) || x === 0) return x;
  const a = x < 0 ? -x : x;
  let y = exp(log(a) / 3);
  y -= (y * y * y - a) / (3 * y * y);
  return x < 0 ? -y : y;
}

export function hypot(a?: number, b?: number, ...rest: number[]): number {
  // Two-argument calls are the hot path in games (distance checks); avoid allocating for them.
  const x = a === undefined ? 0 : +a;
  const y = b === undefined ? 0 : +b;
  let sum = x * x + y * y;
  for (let i = 0; i < rest.length; i++) sum += rest[i]! * rest[i]!;
  return nativeSqrt(sum);
}

export const log2 = (x: number) => log(x) / LN2;
export const log10 = (x: number) => log(x) / LN10;
export const log1p = (x: number) => log(1 + x);
export const expm1 = (x: number) => exp(x) - 1;
export const sinh = (x: number) => (exp(x) - exp(-x)) / 2;
export const cosh = (x: number) => (exp(x) + exp(-x)) / 2;
export function tanh(x: number): number {
  if (x > 20) return 1;
  if (x < -20) return -1;
  const a = exp(x);
  const b = exp(-x);
  return (a - b) / (a + b);
}
export const asinh = (x: number) => (x < 0 ? -log(-x + nativeSqrt(x * x + 1)) : log(x + nativeSqrt(x * x + 1)));
export const acosh = (x: number) => (x < 1 ? NaN : log(x + nativeSqrt(x * x - 1)));
export const atanh = (x: number) => (x <= -1 || x >= 1 ? (x === 1 ? Infinity : x === -1 ? -Infinity : NaN) : 0.5 * log((1 + x) / (1 - x)));

/** Every Math member whose result the spec leaves implementation-approximated. */
export const DETERMINISTIC_MATH = {
  sin,
  cos,
  tan,
  asin,
  acos,
  atan,
  atan2,
  exp,
  expm1,
  log,
  log1p,
  log2,
  log10,
  pow,
  cbrt,
  hypot,
  sinh,
  cosh,
  tanh,
  asinh,
  acosh,
  atanh,
};
