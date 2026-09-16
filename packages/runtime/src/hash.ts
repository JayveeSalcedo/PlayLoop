/**
 * FNV-1a over a string, 32-bit, as 8 hex chars. Used to fingerprint game state
 * so two runs (or two engines) can be compared cheaply. Not cryptographic —
 * it detects divergence, it doesn't authenticate anything.
 */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
