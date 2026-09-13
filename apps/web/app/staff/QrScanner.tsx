"use client";

import { BrowserQRCodeReader } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";

/**
 * Camera-based alternative to typing a voucher code. The QR itself just
 * encodes the bare code (see lib/qr.ts) — same string a staff member would
 * otherwise type — so this is a thin capture layer over the existing
 * lookup flow, not a separate path: it hands the decoded text to `onScan`
 * and gets out of the way.
 */
export function QrScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    let handled = false;
    let cancelled = false;
    let stop: (() => void) | undefined;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        // The callback fires continuously (including a "not found" miss
        // every frame with no code in view) until stopped — only act on
        // the first real hit.
        if (result && !handled) {
          handled = true;
          stop?.();
          onScan(result.getText());
        }
      })
      .then((controls) => {
        stop = () => controls.stop();
        if (cancelled) stop(); // onClose/unmount happened before the camera finished starting
      })
      .catch((e: unknown) => {
        setError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Camera access was denied. Allow it in your browser's site settings, or type the code instead."
            : "Couldn't start the camera — type the code instead.",
        );
      });

    return () => {
      cancelled = true;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onScan is passed fresh each render from ScannerPanel; re-running this effect on that change would restart the camera mid-scan for no reason
  }, []);

  return (
    <div className="card-hard pop-in mt-4 overflow-hidden rounded-2xl bg-ink [border:var(--border-thick)]">
      {error ? (
        <div className="p-4 text-center">
          <p className="text-sm font-bold text-paper">{error}</p>
          <button type="button" className="btn sm mt-3" onClick={onClose}>
            Close
          </button>
        </div>
      ) : (
        <>
          <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
          <div className="p-3">
            <button type="button" className="btn sm block w-full" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
