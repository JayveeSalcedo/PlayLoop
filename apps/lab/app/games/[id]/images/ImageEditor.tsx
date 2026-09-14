"use client";

import { IMAGE_SLOT_SPECS, type ImageShape, type ImageSlot } from "@playloop/runtime";
import { useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { GamePreview } from "@/app/_components/GamePreview";
import { blobToDataUrl, isUpscaled, renderCrop } from "@/lib/crop";

const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
const PREVIEW_MOMENTS = [1, 3, 6];

/** Small previews at the sizes a game typically draws each shape. */
const SIZE_PREVIEWS: Record<ImageShape, { w: number; h: number; label: string }[]> = {
  circle: [
    { w: 96, h: 96, label: "Large" },
    { w: 48, h: 48, label: "Coin" },
    { w: 28, h: 28, label: "Small" },
  ],
  square: [
    { w: 96, h: 96, label: "Large" },
    { w: 56, h: 56, label: "Tile" },
    { w: 32, h: 32, label: "Small" },
  ],
  portrait: [{ w: 90, h: 160, label: "Phone screen" }],
  wide: [
    { w: 240, h: 135, label: "Banner" },
    { w: 120, h: 68, label: "Small" },
  ],
};

function ShapeBox({ shape, src, width, className = "" }: { shape: ImageShape; src: string | null; width: number; className?: string }) {
  const spec = IMAGE_SLOT_SPECS[shape];
  return (
    <div
      className={`shrink-0 overflow-hidden bg-[repeating-conic-gradient(#d9d2f5_0_25%,#fff_0_50%)] bg-[length:14px_14px] [border:var(--border-thick)] ${spec.round ? "rounded-full" : "rounded-lg"} ${className}`}
      style={{ width, height: width / spec.aspect }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : null}
    </div>
  );
}

interface Editing {
  slot: ImageSlot;
  src: string;
}

export function ImageEditor({
  gameId,
  code,
  slots,
  initialImages,
}: {
  gameId: string;
  code: string;
  slots: ImageSlot[];
  initialImages: Record<string, string>;
}) {
  const [images, setImages] = useState<Record<string, string>>(initialImages);
  /** The photo each slot was last cropped from, kept in memory so "Adjust crop" works without re-picking. */
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Editing | null>(null);
  const [moment, setMoment] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Free picked photos when leaving the page (each is also freed when its slot gets a new one).
  const originalsRef = useRef(originals);
  originalsRef.current = originals;
  useEffect(() => () => Object.values(originalsRef.current).forEach((url) => URL.revokeObjectURL(url)), []);

  function pick(slot: ImageSlot, file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("That file isn't an image.");
    if (file.size > MAX_ORIGINAL_BYTES) return setError("That photo is over 25 MB. Pick a smaller one.");
    const src = URL.createObjectURL(file);
    setOriginals((o) => {
      if (o[slot.id]) URL.revokeObjectURL(o[slot.id]!);
      return { ...o, [slot.id]: src };
    });
    setEditing({ slot, src });
  }

  async function remove(slot: ImageSlot) {
    setError(null);
    const res = await fetch(`/api/games/${gameId}/images/${slot.id}`, { method: "DELETE" });
    if (!res.ok) return setError("Couldn't remove that image.");
    setImages(({ [slot.id]: _removed, ...rest }) => rest);
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="card p-3 font-bold text-gum">
          {error}
        </p>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => {
          const spec = IMAGE_SLOT_SPECS[slot.shape];
          const filled = Boolean(images[slot.id]);
          return (
            <li key={slot.id} className="card flex gap-4 p-4">
              <ShapeBox shape={slot.shape} src={images[slot.id] ?? null} width={slot.shape === "wide" ? 110 : slot.shape === "portrait" ? 56 : 80} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <b>{slot.label}</b>
                <span className="text-xs font-bold text-soft">
                  {slot.shape} · {spec.width}×{spec.height} · for {spec.usedFor}
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="btn go sm cursor-pointer">
                    {filled ? "Replace" : "Upload photo"}
                    <input
                      ref={(el) => {
                        inputs.current[slot.id] = el;
                      }}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      data-slot={slot.id}
                      onChange={(e) => {
                        pick(slot, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {originals[slot.id] ? (
                    <button type="button" className="btn sm" onClick={() => setEditing({ slot, src: originals[slot.id]! })}>
                      Adjust crop
                    </button>
                  ) : null}
                  {filled ? (
                    <button type="button" className="btn sm" onClick={() => remove(slot)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <section className="flex flex-col gap-3" aria-labelledby="ingame-h">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="ingame-h" className="text-xl font-extrabold">
            In the game
          </h2>
          <MomentPicker value={moment} onChange={setMoment} />
        </div>
        <GamePreview code={code} images={images} atSeconds={moment} className="mx-auto aspect-[9/16] w-full max-w-[280px]" />
        <p className="text-center text-xs font-semibold text-soft">A still frame of the real game after {moment} s. Some images only appear once their object is on screen.</p>
      </section>

      {editing ? (
        <CropDialog
          key={editing.src + editing.slot.id}
          gameId={gameId}
          code={code}
          slot={editing.slot}
          src={editing.src}
          images={images}
          onCancel={() => setEditing(null)}
          onSaved={(dataUrl) => {
            setImages((i) => ({ ...i, [editing.slot.id]: dataUrl }));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function MomentPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 text-xs font-bold" role="group" aria-label="Preview moment">
      <span className="mr-1 text-soft">Show at</span>
      {PREVIEW_MOMENTS.map((s) => (
        <button key={s} type="button" onClick={() => onChange(s)} className={`chip ${value === s ? "info" : "bg-card"}`} aria-pressed={value === s}>
          {s} s
        </button>
      ))}
    </div>
  );
}

function CropDialog({
  gameId,
  code,
  slot,
  src,
  images,
  onCancel,
  onSaved,
}: {
  gameId: string;
  code: string;
  slot: ImageSlot;
  src: string;
  images: Record<string, string>;
  onCancel: () => void;
  onSaved: (dataUrl: string) => void;
}) {
  const spec = IMAGE_SLOT_SPECS[slot.shape];
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [moment, setMoment] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The crop area is read from the cropper after its props settle, instead of
  // trusting its callbacks: those compute from the last *rendered* position, so
  // a move and release in the same frame (a quick flick) report a stale area,
  // and the preview and saved image would no longer match what's in the frame.
  const cropperRef = useRef<Cropper>(null);
  const [mediaReady, setMediaReady] = useState(false);
  useEffect(() => {
    if (!mediaReady) return;
    const timer = setTimeout(() => {
      const data = cropperRef.current?.getCropData();
      if (data) setArea(data.croppedAreaPixels);
    }, 60);
    return () => clearTimeout(timer);
  }, [crop, zoom, rotation, mediaReady]);

  // Re-render the draft image whenever the selection settles.
  useEffect(() => {
    if (!area) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const blob = await renderCrop(src, area, rotation, spec);
        const url = await blobToDataUrl(blob);
        if (!cancelled) setDraft(url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [area, rotation, src, spec]);

  async function save() {
    if (!area) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await renderCrop(src, area, rotation, spec);
      const res = await fetch(`/api/games/${gameId}/images/${slot.id}`, { method: "PUT", headers: { "content-type": blob.type }, body: blob });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Couldn't save the image.");
      onSaved(await blobToDataUrl(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const blurry = area ? isUpscaled(area, spec) : false;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-night/80 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="crop-h">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-2xl bg-paper p-4 [border:var(--border-thick)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="crop-h" className="text-xl font-extrabold">
              {slot.label}
            </h2>
            <p className="text-xs font-bold text-soft">
              {slot.shape} frame · saved at {spec.width}×{spec.height}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn sm" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn go sm" onClick={save} disabled={saving || !area}>
              {saving ? "Saving…" : "Use this crop"}
            </button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="font-bold text-gum">
            {error}
          </p>
        ) : null}

        <div className="grid gap-5 md:grid-cols-[1fr_280px]">
          <div className="flex flex-col gap-3">
            {/* data-crop exposes the live selection for automated browser checks. */}
            <div className="relative h-[340px] overflow-hidden rounded-xl bg-night sm:h-[420px]" data-crop={JSON.stringify({ crop, zoom, rotation, area })}>
              <Cropper
                ref={cropperRef}
                image={src}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={spec.aspect}
                cropShape={spec.round ? "round" : "rect"}
                minZoom={1}
                maxZoom={5}
                showGrid={!spec.round}
                objectFit="contain"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onMediaLoaded={() => setMediaReady(true)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="zoom" className="text-sm font-extrabold">
                Zoom
              </label>
              <input id="zoom" type="range" min={1} max={5} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="min-w-40 flex-1" />
              <button type="button" className="btn sm" onClick={() => setRotation((r) => (r + 90) % 360)}>
                Rotate 90°
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setZoom(1);
                  setRotation(0);
                  setCrop({ x: 0, y: 0 });
                }}
              >
                Reset
              </button>
            </div>
            <p className="text-xs font-semibold text-soft">Drag to move. Pinch, scroll or use the slider to zoom.</p>
            {blurry && area ? (
              <p className="card p-3 text-sm font-bold" role="status">
                ⚠ This area is only {Math.round(area.width)}×{Math.round(area.height)} pixels of your photo, but the game uses {spec.width}×{spec.height}. It may look blurry. Zoom out or use a sharper photo.
              </p>
            ) : null}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-extrabold">At game sizes</h3>
              <div className="flex flex-wrap items-end gap-3">
                {SIZE_PREVIEWS[slot.shape].map((p) => (
                  <figure key={p.label} className="flex flex-col items-center gap-1">
                    <ShapeBox shape={slot.shape} src={draft} width={p.w} />
                    <figcaption className="text-[11px] font-bold text-soft">{p.label}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold">In the game</h3>
                <MomentPicker value={moment} onChange={setMoment} />
              </div>
              <GamePreview code={code} images={draft ? { ...images, [slot.id]: draft } : images} atSeconds={moment} className="mx-auto aspect-[9/16] w-full max-w-[220px]" />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
