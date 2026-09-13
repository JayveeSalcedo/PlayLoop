/**
 * The drawing API handed to render(). Games draw in logical 360×640 space;
 * the host scales that to the real canvas. Keeping games off the raw canvas
 * means images resolve through slots/packs (no URLs), and the replay can skip
 * rendering entirely.
 */

export interface ShapeStyle {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  /** Corner radius for rect(). */
  radius?: number;
}

export interface TextStyle {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  size?: number;
  weight?: 400 | 600 | 800;
  align?: "left" | "center" | "right";
  baseline?: "top" | "middle" | "bottom" | "alphabetic";
  font?: "display" | "mono";
}

export interface ImageOptions {
  rotation?: number;
  alpha?: number;
  flipX?: boolean;
}

export interface DrawApi {
  clear(color?: string): void;
  rect(x: number, y: number, w: number, h: number, style?: ShapeStyle): void;
  circle(x: number, y: number, r: number, style?: ShapeStyle): void;
  ellipse(x: number, y: number, rx: number, ry: number, style?: ShapeStyle): void;
  line(x1: number, y1: number, x2: number, y2: number, style?: ShapeStyle): void;
  /** Closed polygon from a flat [x0, y0, x1, y1, ...] list. */
  poly(points: number[], style?: ShapeStyle): void;
  text(text: string, x: number, y: number, style?: TextStyle): void;
  /** `ref` is "slot:<id>" (a creator's cropped image) or "pack:<id>" (built-in art). Missing images draw nothing. */
  image(ref: string, x: number, y: number, w: number, h: number, options?: ImageOptions): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(sx: number, sy: number): void;
  alpha(value: number): void;
}

const INK = "#18123f";
const FONT_STACK = {
  display: '"Bricolage Grotesque", ui-rounded, system-ui, sans-serif',
  mono: 'ui-monospace, "Cascadia Code", Consolas, monospace',
};
const MAX_POLY_POINTS = 512;

/**
 * A DrawApi over a 2D canvas context that's already scaled to logical units.
 * `baseTransform` is the logical→canvas matrix, so clear() can fill the whole
 * logical screen even after the game has translated or rotated.
 */
export function createCanvasDraw(
  ctx: CanvasRenderingContext2D,
  resolveImage: (ref: string) => CanvasImageSource | null,
  baseTransform: () => DOMMatrix,
): DrawApi {
  const paint = (style: ShapeStyle | undefined, fallbackFill: string | undefined) => {
    const fill = style?.fill ?? (style?.stroke ? undefined : fallbackFill);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (style?.stroke) {
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.lineWidth ?? 2;
      ctx.stroke();
    }
  };

  return {
    clear(color) {
      ctx.save();
      ctx.setTransform(baseTransform());
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 360, 640);
      } else {
        ctx.clearRect(0, 0, 360, 640);
      }
      ctx.restore();
    },
    rect(x, y, w, h, style) {
      ctx.beginPath();
      if (style?.radius) ctx.roundRect(x, y, w, h, style.radius);
      else ctx.rect(x, y, w, h);
      paint(style, INK);
    },
    circle(x, y, r, style) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
      paint(style, INK);
    },
    ellipse(x, y, rx, ry, style) {
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
      paint(style, INK);
    },
    line(x1, y1, x2, y2, style) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = style?.stroke ?? style?.fill ?? INK;
      ctx.lineWidth = style?.lineWidth ?? 2;
      ctx.stroke();
    },
    poly(points, style) {
      if (!Array.isArray(points) || points.length < 6) return;
      const n = Math.min(points.length, MAX_POLY_POINTS * 2);
      ctx.beginPath();
      ctx.moveTo(points[0]!, points[1]!);
      for (let i = 2; i + 1 < n; i += 2) ctx.lineTo(points[i]!, points[i + 1]!);
      ctx.closePath();
      paint(style, INK);
    },
    text(text, x, y, style) {
      const size = Math.max(6, Math.min(120, style?.size ?? 18));
      ctx.font = `${style?.weight ?? 800} ${size}px ${FONT_STACK[style?.font ?? "display"]}`;
      ctx.textAlign = style?.align ?? "left";
      ctx.textBaseline = style?.baseline ?? "alphabetic";
      const str = String(text).slice(0, 200);
      if (style?.stroke) {
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = style.lineWidth ?? 3;
        ctx.lineJoin = "round";
        ctx.strokeText(str, x, y);
      }
      ctx.fillStyle = style?.fill ?? INK;
      ctx.fillText(str, x, y);
    },
    image(ref, x, y, w, h, options) {
      const img = resolveImage(ref);
      if (!img) return;
      ctx.save();
      if (options?.alpha !== undefined) ctx.globalAlpha *= Math.max(0, Math.min(1, options.alpha));
      ctx.translate(x + w / 2, y + h / 2);
      if (options?.rotation) ctx.rotate(options.rotation);
      if (options?.flipX) ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    },
    save: () => ctx.save(),
    restore: () => ctx.restore(),
    translate: (x, y) => ctx.translate(x, y),
    rotate: (a) => ctx.rotate(a),
    scale: (sx, sy) => ctx.scale(sx, sy),
    alpha: (v) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, v));
    },
  };
}

/** Used where nothing is drawn (the server replay, the game lab). */
export const noopDraw: DrawApi = {
  clear() {},
  rect() {},
  circle() {},
  ellipse() {},
  line() {},
  poly() {},
  text() {},
  image() {},
  save() {},
  restore() {},
  translate() {},
  rotate() {},
  scale() {},
  alpha() {},
};
