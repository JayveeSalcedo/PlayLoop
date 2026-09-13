/**
 * Shared icon art for the PWA manifest/favicon/apple-touch-icon, all
 * rendered via next/og's ImageResponse (Satori) rather than a real image
 * asset — there's no logo art in the repo yet, only this inline SVG mark
 * (the same path used in the landing/app-bar logo). Swap for real brand art
 * whenever that exists; every consumer (icon.tsx, apple-icon.tsx, the
 * /icon-192 and /icon-512 routes) reads from here so there's one place to
 * change.
 */
export function iconMark(size: number) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FFDD3C",
        borderRadius: size * 0.22,
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24">
        <path
          d="M6.5 8.5a3.5 3.5 0 1 0 0 7c2.5 0 3.5-2 5.5-3.5s3-3.5 5.5-3.5a3.5 3.5 0 1 1 0 7c-2.5 0-3.5-2-5.5-3.5S9 8.5 6.5 8.5z"
          fill="none"
          stroke="#18123F"
          strokeWidth={2.6}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
