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
