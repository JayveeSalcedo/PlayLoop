"use client";

import { useEffect, useState } from "react";
import { refreshVoucher } from "./actions";

type RefreshResult = { qrSvg: string; backupCode: string; slotSecondsLeft: number };

/**
 * Active voucher display with auto-rotating QR code every 30 seconds.
 * Matches the prototype's .vch / .vch-rot / .vch-code design:
 * - Large QR code with thick border
 * - Rotating 6-digit backup code below
 * - Countdown progress bar
 * - "Code refreshes in Xs" label
 * - Security note about single-use and screenshot prevention
 */
export function RotatingVoucher({
  voucherId,
  initialQrSvg,
  code,
}: {
  voucherId: string;
  initialQrSvg: string;
  code: string;
}) {
  const [qrSvg, setQrSvg] = useState(initialQrSvg);
  const [backupCode, setBackupCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    // A ref rather than a `let cancelled` closure over one mount: the
    // 225ms flip delay below means a stale response from a prior interval
    // tick could still land after a newer one starts, and only the ref
    // form lets the setTimeout callback see updates from later ticks too.
    let cancelled = false;

    // Trigger the flip animation (prototype's .flip2 keyframe) on QR swap,
    // then swap the actual content once it's rotated out of view. Called
    // from a promise continuation, never directly from the effect body, so
    // an interval tick's setState is always an async reaction to the fetch
    // resolving — not a synchronous render loop.
    const applyRefresh = (result: RefreshResult | null) => {
      if (cancelled || !result) return;
      setFlipping(true);
      setTimeout(() => {
        if (cancelled) return;
        setQrSvg(result.qrSvg);
        setBackupCode(result.backupCode);
        setSecondsLeft(result.slotSecondsLeft);
        setFlipping(false);
      }, 225);
    };

    refreshVoucher(voucherId).then(applyRefresh);
    const interval = setInterval(() => {
      refreshVoucher(voucherId).then(applyRefresh);
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [voucherId]);

  useEffect(() => {
    const tick = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <div className="mt-3">
      {/* QR + code row */}
      <div className="flex items-center gap-3">
        <div
          className={`h-20 w-20 shrink-0 rounded-lg bg-white p-1 transition-transform duration-[450ms] [border:var(--border-thick)] ${
            flipping ? "[transform:rotateY(90deg)]" : ""
          }`}
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div>
          <p className="font-mono text-lg font-extrabold tracking-[.14em]">{code}</p>
          {backupCode && (
            <p className="mt-1 text-[12.5px] font-bold text-soft">
              Backup: <span className="font-mono tracking-[.06em]">{backupCode}</span>
            </p>
          )}
        </div>
      </div>

      {/* Countdown bar — prototype's .vch-rot */}
      <div className="mt-2.5 flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper [border:1.5px_solid_var(--ink)]">
          <div
            className="h-full rounded-full bg-mint transition-[width] duration-1000 ease-linear"
            style={{ width: `${(secondsLeft / 30) * 100}%` }}
          />
        </div>
        <span className="whitespace-nowrap text-[12.5px] font-extrabold text-soft">
          Code refreshes in {secondsLeft}s
        </span>
      </div>

      {/* Security note — prototype's .vch p */}
      <p className="mt-2 text-[13px] font-semibold leading-snug text-soft">
        Single use. The QR and backup code change every 30 seconds, so screenshots will not work.
      </p>
    </div>
  );
}
