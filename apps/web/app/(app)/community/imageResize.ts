const MAX_DIMENSION = 1280;
const QUALITY = 0.8;
const MAX_RAW_BYTES = 15 * 1024 * 1024;

/**
 * Client-side downscale before uploading to Storage. Unlike create/shrink.ts
 * (which center-crops for a fixed-aspect game cover), this fits *within* a
 * max dimension without cropping — right for an arbitrary chat/group photo —
 * and returns a Blob for upload rather than a data URL.
 */
export function shrinkForUpload(file: File): Promise<Blob> {
  if (file.size > MAX_RAW_BYTES) return Promise.reject(new Error("That image is over 15 MB. Pick a smaller one."));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't an image we can read."));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Couldn't process that image."));
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that image."))), "image/jpeg", QUALITY);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
