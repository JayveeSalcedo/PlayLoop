import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { detectImage } from "../lib/imageFormat";

const dataDir = mkdtempSync(path.join(tmpdir(), "playloop-lab-images-"));
process.env.LAB_DATA_DIR = dataDir;
process.env.LAB_EXAMPLES_DIR = path.resolve(__dirname, "../../../packages/runtime/examples");
const images = await import("../lib/images");
const lab = await import("../lib/lab");

afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

// Minimal real headers, enough for header parsing (the server never decodes pixels).
function png(width: number, height: number, padding = 64) {
  const b = new Uint8Array(33 + padding);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}
function webpVp8x(width: number, height: number) {
  const b = new Uint8Array(64);
  b.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X")]);
  const w = width - 1;
  const h = height - 1;
  b.set([w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 24);
  return b;
}
function jpeg(width: number, height: number) {
  // SOI, APP0 (length 16), SOF0 with height/width.
  const b = new Uint8Array(64);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 0);
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255], 20);
  return b;
}

describe("detectImage", () => {
  it("reads type and size from PNG, WebP (VP8X) and JPEG headers", () => {
    expect(detectImage(png(256, 256))).toEqual({ type: "image/png", width: 256, height: 256 });
    expect(detectImage(webpVp8x(720, 1280))).toEqual({ type: "image/webp", width: 720, height: 1280 });
    expect(detectImage(jpeg(1200, 675))).toEqual({ type: "image/jpeg", width: 1200, height: 675 });
  });

  it("rejects things that aren't images", () => {
    expect(detectImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(detectImage(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(detectImage(new Uint8Array(0))).toBeNull();
  });
});

describe("slot image store", () => {
  // Brand Pop declares all four shapes: background (portrait), banner (wide), product (square), logo (circle).
  const GAME = "example-brand-pop";

  it("saves an image that matches its slot, and serves it back as a data URL", async () => {
    const saved = await images.saveSlotImage(GAME, "product", webpVp8x(256, 256));
    expect(saved).toMatchObject({ ok: true, image: { slotId: "product", type: "image/webp" } });
    const urls = await images.slotImageDataUrls(GAME);
    expect(urls.product).toMatch(/^data:image\/webp;base64,/);
  });

  it("rejects the wrong size for the shape with a message that says what's needed", async () => {
    const result = await images.saveSlotImage(GAME, "background", png(256, 256));
    expect(result).toMatchObject({ ok: false, status: 422 });
    expect(result.ok ? "" : result.detail).toMatch(/720×1280/);
  });

  it("rejects unknown slots, non-images, oversized files and JPEG for circles", async () => {
    expect(await images.saveSlotImage(GAME, "nope", png(256, 256))).toMatchObject({ ok: false, status: 404 });
    expect(await images.saveSlotImage(GAME, "logo", new TextEncoder().encode("GIF89a..."))).toMatchObject({ ok: false, status: 415 });
    expect(await images.saveSlotImage(GAME, "banner", png(1200, 675, 310_000))).toMatchObject({ ok: false, status: 413 });
    expect(await images.saveSlotImage(GAME, "logo", jpeg(256, 256))).toMatchObject({ ok: false, status: 422 });
    expect(await images.saveSlotImage("../../etc", "logo", png(256, 256))).toMatchObject({ ok: false, status: 404 });
  });

  it("replaces an image when the format changes, and removes it", async () => {
    await images.saveSlotImage(GAME, "logo", webpVp8x(256, 256));
    await images.saveSlotImage(GAME, "logo", png(256, 256));
    const logos = (await images.listSlotImages(GAME)).filter((i) => i.slotId === "logo");
    expect(logos).toHaveLength(1);
    expect(logos[0]!.type).toBe("image/png");
    await images.removeSlotImage(GAME, "logo");
    expect((await images.listSlotImages(GAME)).some((i) => i.slotId === "logo")).toBe(false);
  });

  it("copies images to a new version only for slots with the same id and shape", async () => {
    await images.saveSlotImage(GAME, "product", webpVp8x(256, 256));
    await images.saveSlotImage(GAME, "banner", webpVp8x(1200, 675));
    const brandPop = (await lab.getGame(GAME))!.code;
    // A "changed" version where the banner became square and the product slot is unchanged.
    const changed = await lab.addGame(brandPop.replace('{ id: "banner", label: "Banner across the top", shape: "wide" }', '{ id: "banner", label: "Banner", shape: "square" }'));
    if (!changed.ok) throw new Error(changed.detail);
    expect(await images.copySlotImages(GAME, changed.id)).toBe(1);
    expect((await images.listSlotImages(changed.id)).map((i) => i.slotId)).toEqual(["product"]);
  }, 30_000);
});
