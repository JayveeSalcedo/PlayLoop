"use client";

/**
 * Animated infinity (lemniscate) loading spinner. The path is a numerically
 * generated lemniscate of Bernoulli (72 segments, fitted to a 0 0 100 50
 * viewBox) — not hand-drawn, so the curve is a real, symmetric figure-8.
 *
 * Uses the SVG `pathLength` attribute to normalize the path to length 1, so
 * the dash animation (a short segment chasing around the loop) works
 * regardless of the path's actual geometry — see the `.spinner-infinity`
 * keyframes in app/globals.css.
 */
const INFINITY_PATH =
  "M94.0,25.0L93.5,28.8L92.1,32.3L89.8,35.3L87.0,37.7L83.8,39.3L80.5,40.2L77.1,40.6L73.9,40.3L70.7,39.7L67.8,38.7L65.1,37.4L62.6,35.9L60.2,34.3L58.0,32.5L55.9,30.7L53.9,28.8L51.9,26.9L50.0,25.0L48.1,23.1L46.1,21.2L44.1,19.3L42.0,17.5L39.8,15.7L37.4,14.1L34.9,12.6L32.2,11.3L29.3,10.3L26.1,9.7L22.9,9.4L19.5,9.8L16.2,10.7L13.0,12.3L10.2,14.7L7.9,17.7L6.5,21.2L6.0,25.0L6.5,28.8L7.9,32.3L10.2,35.3L13.0,37.7L16.2,39.3L19.5,40.2L22.9,40.6L26.1,40.3L29.3,39.7L32.2,38.7L34.9,37.4L37.4,35.9L39.8,34.3L42.0,32.5L44.1,30.7L46.1,28.8L48.1,26.9L50.0,25.0L51.9,23.1L53.9,21.2L55.9,19.3L58.0,17.5L60.2,15.7L62.6,14.1L65.1,12.6L67.8,11.3L70.7,10.3L73.9,9.7L77.1,9.4L80.5,9.8L83.8,10.7L87.0,12.3L89.8,14.7L92.1,17.7L93.5,21.2L94.0,25.0Z";

export function Spinner({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size * 0.5}
      viewBox="0 0 100 50"
      className={`spinner-infinity ${className}`}
      role="status"
      aria-label="Loading"
    >
      <path d={INFINITY_PATH} pathLength={1} fill="none" stroke="currentColor" strokeWidth={7} strokeLinecap="round" />
    </svg>
  );
}
