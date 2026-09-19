"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CoverCropperModalProps {
  imageSrc: string;
  onCrop: (dataUrl: string) => void;
  onCancel: () => void;
  initialRatio?: "16:9" | "4:3";
}

/**
 * Calculates rendering parameters ensuring the image always completely covers
 * the target crop box (no empty transparent or white borders).
 */
function getRenderParams(
  img: HTMLImageElement,
  boxWidth: number,
  boxHeight: number,
  zoom: number,
  panX: number,
  panY: number,
  rotationDeg: number,
) {
  const rad = (rotationDeg * Math.PI) / 180;
  const isRotatedSideways = rotationDeg % 180 !== 0;
  const effWidth = isRotatedSideways ? img.naturalHeight : img.naturalWidth;
  const effHeight = isRotatedSideways ? img.naturalWidth : img.naturalHeight;

  const baseScale = Math.max(boxWidth / effWidth, boxHeight / effHeight);
  const scale = baseScale * zoom;

  const renderedWidth = effWidth * scale;
  const renderedHeight = effHeight * scale;

  const maxPanX = Math.max(0, (renderedWidth - boxWidth) / 2);
  const maxPanY = Math.max(0, (renderedHeight - boxHeight) / 2);

  const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, panX));
  const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, panY));

  return {
    scale,
    clampedPanX,
    clampedPanY,
    maxPanX,
    maxPanY,
    rad,
    renderedWidth,
    renderedHeight,
  };
}

export function CoverCropperModal({
  imageSrc,
  onCrop,
  onCancel,
  initialRatio = "16:9",
}: CoverCropperModalProps) {
  const [ratio, setRatio] = useState<"16:9" | "4:3">(initialRatio);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag state
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  // Pinch state
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);

  // Load image
  useEffect(() => {
    let active = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!active) return;
      setImgElement(img);
      setLoading(false);
      setError(null);
      // Reset position when image loads
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setRotation(0);
    };
    img.onerror = () => {
      if (!active) return;
      setError("Failed to load the image. Please select a valid image file.");
      setLoading(false);
    };
    img.src = imageSrc;
    return () => {
      active = false;
    };
  }, [imageSrc]);

  // Handle escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  // Render preview canvas
  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !imgElement) return;

    const rect = container.getBoundingClientRect();
    const boxWidth = Math.floor(rect.width);
    const boxHeight = Math.floor(ratio === "16:9" ? (boxWidth * 9) / 16 : (boxWidth * 3) / 4);

    if (boxWidth <= 0 || boxHeight <= 0) return;

    // Use devicePixelRatio for crisp rendering on retina displays
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = boxWidth * dpr;
    canvas.height = boxHeight * dpr;
    canvas.style.width = `${boxWidth}px`;
    canvas.style.height = `${boxHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, boxWidth, boxHeight);

    const params = getRenderParams(imgElement, boxWidth, boxHeight, zoom, pan.x, pan.y, rotation);

    ctx.save();
    ctx.translate(boxWidth / 2 + params.clampedPanX, boxHeight / 2 + params.clampedPanY);
    ctx.rotate(params.rad);
    const drawW = imgElement.naturalWidth * params.scale;
    const drawH = imgElement.naturalHeight * params.scale;
    ctx.drawImage(imgElement, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Draw Rule of Thirds grid guidelines
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(boxWidth / 3, 0);
    ctx.lineTo(boxWidth / 3, boxHeight);
    ctx.moveTo((boxWidth * 2) / 3, 0);
    ctx.lineTo((boxWidth * 2) / 3, boxHeight);

    ctx.moveTo(0, boxHeight / 3);
    ctx.lineTo(boxWidth, boxHeight / 3);
    ctx.moveTo(0, (boxHeight * 2) / 3);
    ctx.lineTo(boxWidth, (boxHeight * 2) / 3);
    ctx.stroke();

    // Corner guides
    ctx.setLineDash([]);
    ctx.strokeStyle = "#FFDD3C";
    ctx.lineWidth = 2.5;
    const cLen = 16;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(0, cLen);
    ctx.lineTo(0, 0);
    ctx.lineTo(cLen, 0);
    // Top-right
    ctx.moveTo(boxWidth - cLen, 0);
    ctx.lineTo(boxWidth, 0);
    ctx.lineTo(boxWidth, cLen);
    // Bottom-left
    ctx.moveTo(0, boxHeight - cLen);
    ctx.lineTo(0, boxHeight);
    ctx.lineTo(cLen, boxHeight);
    // Bottom-right
    ctx.moveTo(boxWidth - cLen, boxHeight);
    ctx.lineTo(boxWidth, boxHeight);
    ctx.lineTo(boxWidth, boxHeight - cLen);
    ctx.stroke();

    ctx.restore();
  }, [imgElement, ratio, zoom, pan, rotation]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  // Window resize observer to redraw cleanly
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => drawPreview());
    ro.observe(container);
    return () => ro.disconnect();
  }, [drawPreview]);

  // Mouse interaction handlers
  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  }

  function handleMouseUp() {
    isDraggingRef.current = false;
  }

  // Touch interaction handlers (Drag + Pinch-to-zoom)
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (!touch) return;
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    } else if (e.touches.length === 2) {
      isDraggingRef.current = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      if (!t1 || !t2) return;
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      pinchStartDistRef.current = dist;
      pinchStartZoomRef.current = zoom;
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 1 && isDraggingRef.current) {
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - dragStartRef.current.x;
      const dy = touch.clientY - dragStartRef.current.y;
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    } else if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      if (!t1 || !t2) return;
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const scaleFactor = dist / pinchStartDistRef.current;
      const newZoom = Math.max(1, Math.min(3.5, pinchStartZoomRef.current * scaleFactor));
      setZoom(newZoom);
    }
  }

  function handleTouchEnd() {
    isDraggingRef.current = false;
    pinchStartDistRef.current = null;
  }

  // Mouse wheel zoom
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setZoom((prev) => Math.max(1, Math.min(3.5, prev + delta)));
  }

  // Apply crop and export final image
  function handleApply() {
    if (!imgElement || !containerRef.current) return;

    const outWidth = ratio === "16:9" ? 480 : 400;
    const outHeight = ratio === "16:9" ? 270 : 300;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = outWidth;
    outCanvas.height = outHeight;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) return;

    const rect = containerRef.current.getBoundingClientRect();
    const boxWidth = Math.floor(rect.width);
    const boxHeight = Math.floor(ratio === "16:9" ? (boxWidth * 9) / 16 : (boxWidth * 3) / 4);

    const factor = outWidth / boxWidth;
    const params = getRenderParams(
      imgElement,
      outWidth,
      outHeight,
      zoom,
      pan.x * factor,
      pan.y * factor,
      rotation,
    );

    outCtx.save();
    outCtx.translate(outWidth / 2 + params.clampedPanX, outHeight / 2 + params.clampedPanY);
    outCtx.rotate(params.rad);
    const drawW = imgElement.naturalWidth * params.scale;
    const drawH = imgElement.naturalHeight * params.scale;
    outCtx.drawImage(imgElement, -drawW / 2, -drawH / 2, drawW, drawH);
    outCtx.restore();

    // Export with quality scaling to guarantee staying below COVER_IMAGE_MAX_BYTES (80KB)
    let quality = 0.84;
    let dataUrl = outCanvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > 76_000 && quality > 0.45) {
      quality -= 0.08;
      dataUrl = outCanvas.toDataURL("image/jpeg", quality);
    }

    onCrop(dataUrl);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop cover photo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="card-hard max-h-[96vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-4 sm:p-6 shadow-2xl [border:var(--border-thick)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-ink/10 pb-3">
          <div>
            <h2 className="text-xl font-extrabold text-ink">Crop your cover photo</h2>
            <p className="text-xs font-bold text-soft">
              Drag to frame your game cover and pinch or zoom to fit.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close crop modal"
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-paper font-black text-ink hover:bg-ink/10"
          >
            ✕
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl bg-gum/15 p-3 text-xs font-extrabold text-gum border border-gum/30">
            ⚠️ {error}
          </div>
        ) : null}

        {/* Aspect Ratio Toggle */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs font-extrabold text-soft">Framing aspect ratio:</span>
          <div className="flex gap-1.5 rounded-xl bg-paper p-1 [border:1.5px_solid_var(--ink)]">
            <button
              type="button"
              onClick={() => setRatio("16:9")}
              className={`rounded-lg px-2.5 py-1 text-xs font-black transition-colors ${
                ratio === "16:9" ? "bg-lemon text-ink shadow-sm" : "text-soft hover:text-ink"
              }`}
            >
              16:9 Wide (Banner)
            </button>
            <button
              type="button"
              onClick={() => setRatio("4:3")}
              className={`rounded-lg px-2.5 py-1 text-xs font-black transition-colors ${
                ratio === "4:3" ? "bg-lemon text-ink shadow-sm" : "text-soft hover:text-ink"
              }`}
            >
              4:3 Classic (Card)
            </button>
          </div>
        </div>

        {/* Interactive Crop Viewport */}
        <div className="mt-3">
          <div
            ref={containerRef}
            className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl bg-black [border:var(--border-thick)] shadow-inner select-none touch-none cursor-grab active:cursor-grabbing"
            style={{
              aspectRatio: ratio === "16:9" ? "16 / 9" : "4 / 3",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            {loading ? (
              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/70">
                Loading image…
              </div>
            ) : null}
            <canvas ref={canvasRef} className="block h-full w-full" />
          </div>

          <p className="mt-1.5 text-center text-[11px] font-bold text-soft">
            ✋ Drag to reposition · 🔍 Scroll or pinch to zoom
          </p>
        </div>

        {/* Controls Toolbar */}
        <div className="mt-4 space-y-3 rounded-2xl bg-paper/60 p-3.5 [border:1.5px_solid_rgba(0,0,0,0.08)]">
          {/* Zoom Slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-extrabold text-soft shrink-0">Zoom:</span>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom((z) => Math.max(1, z - 0.15))}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-card font-black text-xs [border:1.5px_solid_var(--ink)] hover:bg-lemon"
            >
              −
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.02}
              value={zoom}
              aria-label="Zoom level"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-ink cursor-pointer"
            />
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(3, z + 0.15))}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-card font-black text-xs [border:1.5px_solid_var(--ink)] hover:bg-lemon"
            >
              +
            </button>
            <span className="w-10 text-right text-xs font-black font-mono">
              {zoom.toFixed(1)}x
            </span>
          </div>

          {/* Action buttons: Rotate & Reset */}
          <div className="flex items-center justify-between pt-1 border-t border-ink/10">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="btn sm bg-card text-ink font-bold hover:bg-lemon text-xs py-1 px-2.5 inline-flex items-center gap-1"
              >
                <span>↻</span> Rotate 90°
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                  setRotation(0);
                }}
                className="btn sm bg-card text-ink font-bold hover:bg-ink/5 text-xs py-1 px-2.5 inline-flex items-center gap-1"
              >
                <span>↺</span> Reset
              </button>
            </div>
            <span className="text-[11px] font-bold text-soft">
              {rotation > 0 ? `${rotation}° rotated` : "Centered"}
            </span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-5 flex items-center justify-end gap-2 border-t-2 border-ink/10 pt-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn sm bg-paper text-ink font-bold hover:bg-ink/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={loading || !!error}
            className="btn go sm inline-flex items-center gap-1.5"
          >
            <span>✓ Apply Crop</span>
          </button>
        </div>
      </div>
    </div>
  );
}
