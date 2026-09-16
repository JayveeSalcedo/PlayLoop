/**
 * Creator images for a game's slots, stored under .data/images/<gameId>/.
 *
 * The lab keeps them on disk; the merge phase moves this to Supabase Storage
 * with signed uploads. The checks stay the same: the slot must exist, the file
 * must really be a PNG/JPEG/WebP, under the size limit, and exactly the pixel
 * size its shape exports (the cropper produces that; anything else didn't come
 * from it).
 */
import { IMAGE_SLOT_SPECS, MAX_IMAGE_BYTES, type ImageSlot } from "@playloop/runtime";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { detectImage, type ImageType } from "./imageFormat";
import { getGame } from "./lab";

const DATA_DIR = process.env.LAB_DATA_DIR ?? path.join(process.cwd(), ".data");
const IMAGES_DIR = path.join(DATA_DIR, "images");

const EXT: Record<ImageType, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const TYPE_BY_EXT: Record<string, ImageType> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const SAFE_ID = /^[a-z0-9-]{1,80}$/;

export interface SlotImage {
  slotId: string;
  type: ImageType;
  bytes: number;
  updatedAt: string;
}

const gameDir = (gameId: string) => path.join(IMAGES_DIR, gameId);

async function slotFile(gameId: string, slotId: string): Promise<{ file: string; type: ImageType } | null> {
  const dir = gameDir(gameId);
  if (!existsSync(dir)) return null;
  for (const name of await readdir(dir)) {
    const [base, ext] = name.split(".");
    if (base === slotId && ext && TYPE_BY_EXT[ext]) return { file: path.join(dir, name), type: TYPE_BY_EXT[ext]! };
  }
  return null;
}

export async function listSlotImages(gameId: string): Promise<SlotImage[]> {
  if (!SAFE_ID.test(gameId) || !existsSync(gameDir(gameId))) return [];
  const out: SlotImage[] = [];
  for (const name of await readdir(gameDir(gameId))) {
    const [slotId, ext] = name.split(".");
    const type = ext ? TYPE_BY_EXT[ext] : undefined;
    if (!slotId || !type) continue;
    const info = await stat(path.join(gameDir(gameId), name));
    out.push({ slotId, type, bytes: info.size, updatedAt: info.mtime.toISOString() });
  }
  return out;
}

export async function readSlotImage(gameId: string, slotId: string): Promise<{ data: Buffer; type: ImageType } | null> {
  if (!SAFE_ID.test(gameId) || !SAFE_ID.test(slotId)) return null;
  const found = await slotFile(gameId, slotId);
  if (!found) return null;
  return { data: await readFile(found.file), type: found.type };
}

/** Every filled slot as a data: URL, which is what the sandboxed game frame accepts. */
export async function slotImageDataUrls(gameId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const image of await listSlotImages(gameId)) {
    const read = await readSlotImage(gameId, image.slotId);
    if (read) out[image.slotId] = `data:${read.type};base64,${read.data.toString("base64")}`;
  }
  return out;
}

export type SaveResult = { ok: true; image: SlotImage } | { ok: false; status: number; detail: string };

export async function saveSlotImage(gameId: string, slotId: string, data: Uint8Array): Promise<SaveResult> {
  const game = SAFE_ID.test(gameId) ? await getGame(gameId) : null;
  if (!game?.meta) return { ok: false, status: 404, detail: "That game doesn't exist." };
  const slot: ImageSlot | undefined = game.meta.imageSlots?.find((s) => s.id === slotId);
  if (!slot) return { ok: false, status: 404, detail: `This game has no image slot called "${slotId}".` };
  if (data.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, detail: `The image is ${(data.byteLength / 1000).toFixed(0)} KB; the limit is ${MAX_IMAGE_BYTES / 1000} KB.` };
  }
  const info = detectImage(data);
  if (!info) return { ok: false, status: 415, detail: "That file isn't a PNG, JPEG or WebP image." };
  const spec = IMAGE_SLOT_SPECS[slot.shape];
  if (info.width !== spec.width || info.height !== spec.height) {
    return {
      ok: false,
      status: 422,
      detail: `A ${slot.shape} slot needs a ${spec.width}×${spec.height} image; this one is ${info.width}×${info.height}. Crop it in the image editor.`,
    };
  }
  if (spec.round && info.type === "image/jpeg") {
    return { ok: false, status: 422, detail: "A circle slot needs transparent corners, so use PNG or WebP." };
  }

  await removeSlotImage(gameId, slotId);
  await mkdir(gameDir(gameId), { recursive: true });
  const file = path.join(gameDir(gameId), `${slotId}.${EXT[info.type]}`);
  await writeFile(file, data);
  return { ok: true, image: { slotId, type: info.type, bytes: data.byteLength, updatedAt: new Date().toISOString() } };
}

export async function removeSlotImage(gameId: string, slotId: string): Promise<void> {
  if (!SAFE_ID.test(gameId) || !SAFE_ID.test(slotId)) return;
  const found = await slotFile(gameId, slotId);
  if (found) await rm(found.file, { force: true });
}

/**
 * Carries images over to a new version of a game (e.g. after an AI change),
 * for slots that still exist there with the same shape.
 */
export async function copySlotImages(fromGameId: string, toGameId: string): Promise<number> {
  const [from, to] = await Promise.all([getGame(fromGameId), getGame(toGameId)]);
  if (!from?.meta || !to?.meta) return 0;
  let copied = 0;
  for (const image of await listSlotImages(fromGameId)) {
    const oldSlot = from.meta.imageSlots?.find((s) => s.id === image.slotId);
    const newSlot = to.meta.imageSlots?.find((s) => s.id === image.slotId);
    if (!oldSlot || !newSlot || oldSlot.shape !== newSlot.shape) continue;
    const source = await slotFile(fromGameId, image.slotId);
    if (!source) continue;
    await mkdir(gameDir(toGameId), { recursive: true });
    await copyFile(source.file, path.join(gameDir(toGameId), path.basename(source.file)));
    copied += 1;
  }
  return copied;
}
