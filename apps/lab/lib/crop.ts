/**
 * Browser-only: turns a picked photo + the cropper's selection into the exact
 * image a slot needs. Everything happens on the device; only the result is
 * uploaded.
 */
import { MAX_IMAGE_BYTES, type IMAGE_SLOT_SPECS } from "@playloop/runtime";

type SlotSpec = (typeof IMAGE_SLOT_SPECS)[keyof typeof IMAGE_SLOT_SPECS];

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Size of the box that contains a w×h image rotated by `degrees`. */
export function rotatedSize(width: number, height: number, degrees: number) {
  const r = (degrees * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(r) * width) + Math.abs(Math.sin(r) * height),
    height: Math.abs(Math.sin(r) * width) + Math.abs(Math.cos(r) * height),
  };
}

/** True when the selected area has fewer source pixels than the slot exports, so the result is upscaled. */
export function isUpscaled(area: CropArea, spec: SlotSpec): boolean {
  return area.width < spec.width * 0.98 || area.height < spec.height * 0.98;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file isn't an image this browser can open."));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Renders the crop at the spec's exact size. Circles get transparent corners.
 * Tries WebP, then steps quality down, then falls back to JPEG (no alpha) or
 * PNG so the file stays under the upload limit.
 */
export async function renderCrop(src: string, area: CropArea, rotation: number, spec: SlotSpec): Promise<Blob> {
  const image = await loadImage(src);

  // 1. The whole photo, rotated, on a canvas big enough to hold it.
  const box = rotatedSize(image.naturalWidth, image.naturalHeight, rotation);
  const rotated = document.createElement("canvas");
  rotated.width = Math.round(box.width);
  rotated.height = Math.round(box.height);
  const rctx = rotated.getContext("2d");
  if (!rctx) throw new Error("This browser can't process images.");
  rctx.translate(rotated.width / 2, rotated.height / 2);
  rctx.rotate((rotation * Math.PI) / 180);
  rctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

  // 2. The selected area, scaled to the slot's export size.
  const out = document.createElement("canvas");
  out.width = spec.width;
  out.height = spec.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("This browser can't process images.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (spec.round) {
    ctx.beginPath();
    ctx.arc(spec.width / 2, spec.height / 2, spec.width / 2, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.drawImage(rotated, area.x, area.y, area.width, area.height, 0, 0, spec.width, spec.height);

  for (const quality of [0.86, 0.72, 0.55]) {
    const webp = await canvasToBlob(out, "image/webp", quality);
    if (webp?.type === "image/webp" && webp.size <= MAX_IMAGE_BYTES) return webp;
    if (webp && webp.type !== "image/webp") break; // no WebP encoder (older Safari)
  }
  if (!spec.round) {
    for (const quality of [0.86, 0.7]) {
      const jpeg = await canvasToBlob(out, "image/jpeg", quality);
      if (jpeg && jpeg.size <= MAX_IMAGE_BYTES) return jpeg;
    }
  }
  const png = await canvasToBlob(out, "image/png");
  if (png && png.size <= MAX_IMAGE_BYTES) return png;
  throw new Error("Couldn't make this image small enough. Try a simpler photo.");
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read the image."));
    reader.readAsDataURL(blob);
  });
}
