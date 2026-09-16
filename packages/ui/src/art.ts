/**
 * Procedural art helpers, ported from the prototype
 * (reference/playloop-prototype.html, lines 957-1031 and 1430-1431).
 *
 * These are pure functions that return SVG markup strings. They have no
 * framework dependency — use them via `dangerouslySetInnerHTML` in React,
 * or directly as `innerHTML` elsewhere (e.g. inside the game engine's
 * canvas-free templates).
 */

export const INK = "#18123F";

export const THEMES: Record<string, [string, string]> = {
  ember: ["#FF7A1A", "#FFDD3C"],
  sun: ["#FFDD3C", "#FF5FA2"],
  neon: ["#5B3BFF", "#3FC8FF"],
  bloom: ["#FF5FA2", "#FFDD3C"],
  mint: ["#22D39B", "#5B3BFF"],
  sky: ["#3FC8FF", "#FFDD3C"],
};

export type ThemeName = keyof typeof THEMES;

const ICONS: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
  gift: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zm0 0s2-5 4.5-3.5S15 8 12 8z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  trophy:
    '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
  msg: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  story: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  cup: '<path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3c0 1.5 1.5 1.5 1.5 3M12 3c0 1.5 1.5 1.5 1.5 3"/>',
  flame: '<path d="M12 21a6 6 0 0 0 6-6c0-5-6-12-6-12S6 10 6 15a6 6 0 0 0 6 6z"/>',
  ticket:
    '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 6v12" stroke-dasharray="2 2.5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M19 19v2H6"/>',
  spark:
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};

export type IconName = keyof typeof ICONS;

/** Renders a named icon as an inline `<svg>` string. */
export function icon(name: IconName, className = ""): string {
  return `<svg class="ico ${className}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

interface AvatarSpec {
  c: string; // body color
  e: string; // eye/mouth color
  s: 0 | 1 | 2; // shape: circle, rounded square, blob
}

export const AVATARS: AvatarSpec[] = [
  { c: "#D7FF4A", e: INK, s: 0 },
  { c: "#FF5FA2", e: "#fff", s: 1 },
  { c: "#3FC8FF", e: INK, s: 2 },
  { c: "#FFB321", e: INK, s: 0 },
  { c: "#8A6BFF", e: "#fff", s: 1 },
  { c: "#FF9DE2", e: INK, s: 2 },
];

/** Renders one of the 6 preset player avatars as an inline `<svg>` string. */
export function avatar(index: number, size = 40): string {
  const a = AVATARS[((index % AVATARS.length) + AVATARS.length) % AVATARS.length]!;
  const shape =
    a.s === 0
      ? '<circle cx="50" cy="52" r="42"/>'
      : a.s === 1
        ? '<rect x="9" y="11" width="82" height="82" rx="30"/>'
        : '<path d="M50 8c24 0 42 16 42 42s-16 44-42 44S8 76 8 50 26 8 50 8z" transform="rotate(-10 50 50)"/>';
  const hl = a.e === "#fff" ? a.c : "#fff";
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><g fill="${a.c}" stroke="${INK}" stroke-width="5">${shape}</g><ellipse cx="37" cy="49" rx="6.5" ry="8.5" fill="${a.e}"/><ellipse cx="63" cy="49" rx="6.5" ry="8.5" fill="${a.e}"/><circle cx="39.5" cy="45.5" r="2.4" fill="${hl}"/><circle cx="65.5" cy="45.5" r="2.4" fill="${hl}"/><path d="M42 65q8 7 16 0" stroke="${a.e}" stroke-width="4.5" fill="none" stroke-linecap="round"/><ellipse cx="27" cy="63" rx="6" ry="3.5" fill="#FF3D7F" opacity=".35"/><ellipse cx="73" cy="63" rx="6" ry="3.5" fill="#FF3D7F" opacity=".35"/></svg>`;
}

export type ItemKind = "star" | "gem" | "orb" | "bean";

/** Renders one collectible item shape (used on catch-game cards and the falling items). */
export function itemShape(item: ItemKind, x: number, y: number, s: number, fill?: string): string {
  const st = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"`;
  switch (item) {
    case "star":
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0-13 3.8-4.2 13-3.9 5.8 2 8.2 11.5 0 6-8.2 11.5-5.8 2-13-3.9-3.8-4.2Z" fill="${fill || "#FFDD3C"}" ${st}/></g>`;
    case "gem":
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-11-4-5-11H5L11-4 0 12Z" fill="${fill || "#3FC8FF"}" ${st}/><path d="M-11-4H11M-3-11 0 12 3-11" fill="none" stroke="${INK}" stroke-width="1.6"/></g>`;
    case "orb":
      return `<g transform="translate(${x} ${y}) scale(${s})"><circle r="11" fill="${fill || "#FF5FA2"}" ${st}/><circle cx="-4" cy="-4" r="3" fill="#fff" opacity=".85"/></g>`;
    default:
      return `<g transform="translate(${x} ${y}) rotate(25) scale(${s})"><ellipse rx="9" ry="12.5" fill="${fill || "#5A2E14"}" ${st}/><path d="M-2-10.5C4-4-4 4 2 10.5" stroke="${fill ? INK : "#FFB27A"}" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>`;
  }
}

export const MEMORY_SHAPES: string[] = [
  `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="#22D39B" stroke="${INK}" stroke-width="3"/></svg>`,
  `<svg viewBox="0 0 40 40"><path d="M20 5 36 34H4Z" fill="#FF5FA2" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 40 40"><rect x="6" y="6" width="28" height="28" rx="6" fill="#3FC8FF" stroke="${INK}" stroke-width="3"/></svg>`,
  `<svg viewBox="-20 -20 40 40">${itemShape("star", 0, 1, 1.35)}</svg>`,
  `<svg viewBox="0 0 40 40"><path d="M20 3 36 20 20 37 4 20Z" fill="#FF7A1A" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 40 40"><path d="M20 34S5 25 5 15a7.5 7.5 0 0 1 15-3 7.5 7.5 0 0 1 15 3c0 10-15 19-15 19z" fill="#8A6BFF" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></svg>`,
];

export type GameArtType = "catch" | "quiz" | "memory" | "reflex";

/**
 * Renders the 160x120 cover art used on game cards, per template type + theme.
 *
 * `type` is null for a code game, which isn't one of the four templates and has
 * no art of its own yet; it falls through to the generic badge below. Giving
 * generated games real cover art is its own piece of work.
 */
export function artSVG(type: GameArtType | null, theme: ThemeName = "neon", item: ItemKind = "bean"): string {
  const [a, b] = THEMES[theme] || THEMES.neon!;
  const sw = `stroke="${INK}" stroke-width="2.6"`;
  let inner = "";
  const decor = `<circle cx="146" cy="8" r="44" fill="${b}"/><circle cx="18" cy="104" r="26" fill="${b}" opacity=".55"/><circle cx="30" cy="22" r="3" fill="#fff" opacity=".7"/><circle cx="120" cy="92" r="2.5" fill="#fff" opacity=".7"/>`;

  if (type === "catch") {
    inner =
      itemShape(item, 38, 30, 1.25) +
      itemShape(item, 90, 20, 1) +
      itemShape(item, 124, 50, 1.45) +
      itemShape(item, 62, 58, 0.9) +
      `<g transform="translate(80 98)"><path d="M-27-20H27L21 16H-21Z" fill="#fff" ${sw}/><path d="M-24.5-7H24.5L22.6 5H-22.6Z" fill="${theme === "ember" ? "#18123F" : b}" stroke="${INK}" stroke-width="2.2"/><path d="M-8-28c0-4 4-4 4-8M4-28c0-4 4-4 4-8" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>`;
  } else if (type === "quiz") {
    inner =
      `<g transform="translate(80 54)"><path d="M-40-22a16 16 0 0 1 16-16h48a16 16 0 0 1 16 16v30a16 16 0 0 1-16 16H4l-12 14-2-14h-14a16 16 0 0 1-16-16z" fill="#fff" ${sw} stroke-linejoin="round"/><text x="0" y="10" text-anchor="middle" font-family="Bricolage Grotesque,system-ui,sans-serif" font-weight="800" font-size="46" fill="${INK}">?</text></g>` +
      `<rect x="12" y="84" width="34" height="12" rx="6" fill="#fff" stroke="${INK}" stroke-width="2"/><rect x="114" y="82" width="34" height="12" rx="6" fill="${b}" stroke="${INK}" stroke-width="2"/><rect x="118" y="100" width="28" height="10" rx="5" fill="#fff" stroke="${INK}" stroke-width="2"/>`;
  } else if (type === "memory") {
    const back = `<rect x="-20" y="-28" width="40" height="56" rx="8" fill="${INK}" ${sw}/><circle r="9" fill="none" stroke="${b}" stroke-width="3"/>`;
    const face = `<rect x="-21" y="-29" width="42" height="58" rx="8" fill="#fff" ${sw}/>${itemShape("star", 0, 0, 1.1)}`;
    inner = `<g transform="translate(80 62)"><g transform="rotate(-14) translate(-40 4)">${back}</g><g transform="rotate(12) translate(40 4)">${face}</g><g transform="translate(0 -2)">${face}</g></g>`;
  } else {
    inner = `<g transform="translate(74 62)"><circle r="44" fill="#fff" ${sw}/><circle r="30" fill="${b}" ${sw}/><circle r="15" fill="#fff" ${sw}/><circle r="5" fill="${INK}"/></g><g transform="translate(122 36)"><circle r="16" fill="#D7FF4A" ${sw}/><circle cx="-5" cy="-2" r="2.4" fill="${INK}"/><circle cx="5" cy="-2" r="2.4" fill="${INK}"/><path d="M-5 5q5 4 10 0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/></g><path d="M100 18l-6-8M140 20l6-8M146 40h9" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  }

  return `<svg class="art" viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="160" height="120" fill="${a}"/>${decor}${inner}</svg>`;
}

/** Happy/sad face used by the reflex game's targets. */
export const GOOD_FACE = `<svg viewBox="0 0 40 40"><circle cx="13" cy="17" r="3.4" fill="${INK}"/><circle cx="27" cy="17" r="3.4" fill="${INK}"/><path d="M13 25q7 6 14 0" stroke="${INK}" stroke-width="3.2" fill="none" stroke-linecap="round"/></svg>`;
/** Card back for the memory game — the playloop loop mark (prototype's MEMBACK, playloop-prototype.html:1432). */
export const MEMORY_BACK = `<svg viewBox="0 0 24 24"><path d="M6.5 8.5a3.5 3.5 0 1 0 0 7c2.5 0 3.5-2 5.5-3.5s3-3.5 5.5-3.5a3.5 3.5 0 1 1 0 7c-2.5 0-3.5-2-5.5-3.5S9 8.5 6.5 8.5z" fill="none" stroke="#FFDD3C" stroke-width="2.6" stroke-linecap="round"/></svg>`;

export const BAD_FACE =`<svg viewBox="0 0 40 40"><path d="M10 13l6 6M16 13l-6 6M24 13l6 6M30 13l-6 6" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M13 29q7-5 14 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
