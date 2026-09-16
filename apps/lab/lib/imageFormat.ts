/**
 * Reads an image's real type and pixel size from its header bytes (PNG, JPEG,
 * WebP), without decoding it. The server uses this to check that an upload is
 * what it claims to be and exactly the size its slot shape exports.
 */

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

export interface ImageInfo {
  type: ImageType;
  width: number;
  height: number;
}

const ascii = (b: Uint8Array, at: number, text: string) => [...text].every((c, i) => b[at + i] === c.charCodeAt(0));
const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u16le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u24le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
const u32be = (b: Uint8Array, at: number) => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;

export function detectImage(bytes: Uint8Array): ImageInfo | null {
  const b = bytes;
  // PNG: signature, then the IHDR chunk carries width and height.
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, "PNG") && ascii(b, 12, "IHDR")) {
    return { type: "image/png", width: u32be(b, 16), height: u32be(b, 20) };
  }
  // WebP: RIFF container with a VP8 / VP8L / VP8X first chunk.
  if (b.length >= 30 && ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) {
    if (ascii(b, 12, "VP8X")) return { type: "image/webp", width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
    if (ascii(b, 12, "VP8L") && b[20] === 0x2f) {
      const width = 1 + (((b[22]! & 0x3f) << 8) | b[21]!);
      const height = 1 + (((b[24]! & 0x0f) << 10) | (b[23]! << 2) | ((b[22]! & 0xc0) >> 6));
      return { type: "image/webp", width, height };
    }
    if (ascii(b, 12, "VP8 ")) return { type: "image/webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    return null;
  }
  // JPEG: walk marker segments to the first start-of-frame.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const length = u16be(b, i + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { type: "image/jpeg", width: u16be(b, i + 7), height: u16be(b, i + 5) };
      i += 2 + length;
    }
  }
  return null;
}
