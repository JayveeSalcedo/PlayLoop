"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { icon } from "@playloop/ui";

/**
 * Floating action button that opens a fullscreen QR scanner.
 * Uses the native BarcodeDetector API (Chrome/Edge/Samsung) with
 * a manual code input fallback for unsupported browsers.
 */
export function ArenaScanButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const hasDetector = typeof window !== "undefined" && "BarcodeDetector" in window;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);
  const router = useRouter();

  const stopCamera = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    stopCamera();
    setOpen(false);
    setError("");
    setManualCode("");
    setScanning(false);
  }, [stopCamera]);

  /** Extract arena code from a scanned URL or raw code. */
  function extractCode(raw: string): string | null {
    // URL format: .../events/join?code=XXXXXX
    try {
      const url = new URL(raw);
      const code = url.searchParams.get("code");
      if (code) return code.toUpperCase();
    } catch {
      // not a URL — treat as raw code
    }
    const cleaned = raw.trim().toUpperCase();
    if (/^[A-Z0-9]{4,8}$/.test(cleaned)) return cleaned;
    return null;
  }

  function navigateToArena(code: string) {
    handleClose();
    router.push(`/events/join?code=${code}`);
  }

  /** Start camera and scan for QR codes. */
  async function startScanning() {
    setError("");
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new (window as any).BarcodeDetector({
        formats: ["qr_code"],
      });

      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const code = extractCode(barcodes[0].rawValue);
            if (code) {
              navigateToArena(code);
              return;
            }
          }
        } catch {
          /* frame not ready yet */
        }
        animRef.current = requestAnimationFrame(scan);
      };
      // Small delay to let video warm up
      setTimeout(() => {
        animRef.current = requestAnimationFrame(scan);
      }, 500);
    } catch {
      setError("Camera access denied. Enter the code manually.");
      setScanning(false);
    }
  }

  // Clean up on unmount
  useEffect(() => stopCamera, [stopCamera]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet px-4 py-3 font-extrabold text-white [border:var(--border-thick)] [box-shadow:var(--shadow-sm)] transition-transform active:scale-95"
        aria-label="Scan QR to join arena"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="3" height="3" />
          <line x1="21" y1="14" x2="21" y2="21" />
          <line x1="14" y1="21" x2="21" y2="21" />
        </svg>
        Join Arena
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-ink/95">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-lg font-extrabold text-white">Scan Arena Code</h2>
        <button
          onClick={handleClose}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white"
          aria-label="Close scanner"
        >
          <span dangerouslySetInnerHTML={{ __html: icon("close") }} />
        </button>
      </div>

      {/* Scanner area */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        {hasDetector && (
          <>
            <div className="relative w-full max-w-xs aspect-square overflow-hidden rounded-3xl border-4 border-lemon/60">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
              />
              {/* Scanner overlay corners */}
              <div className="absolute inset-4 border-2 border-white/30 rounded-2xl pointer-events-none" />
              {/* Animated scan line */}
              {scanning && (
                <div className="absolute left-4 right-4 h-0.5 bg-lemon animate-bounce" style={{ top: "50%" }} />
              )}
            </div>
            {!scanning && (
              <button
                onClick={startScanning}
                className="rounded-xl bg-lemon px-8 py-3 font-extrabold text-ink [border:var(--border-thick)] transition-transform active:scale-95"
              >
                Start Camera
              </button>
            )}
            {scanning && (
              <p className="text-sm font-bold text-white/60 animate-pulse">
                Point at the QR code on the big screen...
              </p>
            )}
          </>
        )}

        {!hasDetector && (
          <p className="text-center text-sm font-bold text-white/60">
            QR scanning not supported on this browser.
            <br />
            Enter the code manually below.
          </p>
        )}

        {error && (
          <p className="text-center text-sm font-bold text-red-400">{error}</p>
        )}

        {/* Manual code fallback — always visible */}
        <div className="w-full max-w-xs space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs font-bold text-white/30 uppercase">or enter code</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.toUpperCase())}
            placeholder="ENTER CODE"
            maxLength={8}
            className="w-full rounded-xl border-2 border-white/20 bg-white/10 px-4 py-3 text-center text-2xl font-extrabold uppercase tracking-widest text-white outline-none focus:border-lemon"
          />
          <button
            onClick={() => {
              const code = extractCode(manualCode);
              if (code) navigateToArena(code);
              else setError("Invalid code");
            }}
            disabled={manualCode.length < 4}
            className="w-full rounded-xl bg-lemon px-6 py-3 font-extrabold text-ink [border:var(--border-thick)] disabled:opacity-40 transition-transform active:scale-95"
          >
            Join Arena
          </button>
        </div>
      </div>
    </div>
  );
}
