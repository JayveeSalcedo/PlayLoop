/**
 * Browser-only: turns a picked file into a small square JPEG data URL for a
 * Memory game's pair images. Ported from the prototype's shrink()
 * (reference/playloop-prototype.html:1610).
 *
 * Custom images live inline in games.config as data URLs — there's no Supabase
 * Storage bucket yet — so downscaling here is what keeps a game row small
 * enough to be worth storing. Swap this for a real upload when image volume
 * justifies the bucket.
 */
const SIZE = 220;
const QUALITY = 0.82;

export function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't an image we can read."));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Couldn't process that image."));
        // Center-crop to a square so every pair card is framed the same way.
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
        resolve(canvas.toDataURL("image/jpeg", QUALITY));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const COVER_WIDTH = 400;
const COVER_HEIGHT = 300;
const MAX_RAW_BYTES = 25 * 1024 * 1024;

/**
 * Browser-only: turns a picked file into a 4:3 landscape JPEG data URL for a
 * game's cover photo, center-cropped and compressed to ~30-50 KB.
 */
export function shrinkCoverImage(file: File): Promise<string> {
  if (file.size > MAX_RAW_BYTES) {
    return Promise.reject(new Error("That image is over 25 MB. Pick a smaller one."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't an image we can read."));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = COVER_WIDTH;
        canvas.height = COVER_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Couldn't process that image."));

        // Center-crop to 4:3 landscape ratio
        const targetAspect = COVER_WIDTH / COVER_HEIGHT;
        const srcAspect = img.width / img.height;
        let sx = 0;
        let sy = 0;
        let sw = img.width;
        let sh = img.height;

        if (srcAspect > targetAspect) {
          sw = img.height * targetAspect;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetAspect;
          sy = (img.height - sh) / 2;
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, COVER_WIDTH, COVER_HEIGHT);
        resolve(canvas.toDataURL("image/jpeg", QUALITY));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

