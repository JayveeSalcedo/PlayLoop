"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { icon } from "@playloop/ui";
import { SuccessModal } from "@/app/_components/SuccessModal";
import { lookupVoucher, redeemVoucher, undoRedemption, type LookupResult } from "./actions";
import { QrScanner } from "./QrScanner";

type Stage = "idle" | "checking" | "found" | "redeeming" | "done";

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-GB");
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function ScannerPanel() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [done, setDone] = useState<{ rewardName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  function reset() {
    setCode("");
    setResult(null);
    setDone(null);
    setError(null);
    setStage("idle");
  }

  // Takes an explicit value so a scan can look itself up immediately,
  // rather than waiting a render for `code` state to catch up.
  async function check(value: string = code) {
    if (!value.trim()) return;
    setStage("checking");
    setError(null);
    try {
      const r = await lookupVoucher(value);
      setResult(r);
      setStage("found");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check that code — try again.");
      setStage("idle");
    }
  }

  function onScan(scanned: string) {
    setScanning(false);
    setCode(scanned);
    check(scanned);
  }

  async function confirm() {
    setStage("redeeming");
    setError(null);
    try {
      const r = await redeemVoucher(code);
      setDone({ rewardName: r.rewardName });
      setStage("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't redeem that voucher — try again.");
      setStage("found");
    }
  }

  if (stage === "done" && done) {
    return (
      <SuccessModal
        isOpen={true}
        onClose={reset}
        title="VOUCHER CONFIRMED & CONSUMED"
        badgeText="Redemption Verified"
        iconHtml={icon("check")}
        accentColor="mint"
        confetti={true}
        soundEffect="victory"
        primaryAction={{
          label: "Scan Next Customer",
          onClick: reset,
        }}
      >
        <div className="flex flex-col gap-3 text-center">
          <div className="rounded-2xl bg-paper p-4 border-2 border-ink shadow-hard-sm">
            <span className="text-[10px] font-black uppercase tracking-wider text-soft">Hand Over Item</span>
            <p className="text-2xl font-black text-ink mt-1">{done.rewardName}</p>
          </div>
          <p className="text-xs text-soft font-semibold">
            Voucher {code} successfully redeemed and recorded in the store ledger.
          </p>
        </div>
      </SuccessModal>
    );
  }

  return (
    <div className="mt-6 card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)]">
      <label className="block text-sm font-extrabold" htmlFor="voucher-code">
        Scan or Enter Voucher Code
      </label>
      <p className="mb-3 text-xs font-bold text-soft">Type the code under the customer&apos;s QR, or scan it directly.</p>
      <div className="flex gap-2">
        <input
          id="voucher-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (result) {
              setResult(null);
              setStage("idle");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") check();
          }}
          placeholder="BH-4F2A-91"
          autoCapitalize="characters"
          autoComplete="off"
          className="w-full rounded-2xl bg-card p-3 font-semibold tracking-widest uppercase [border:var(--border-thick)]"
          suppressHydrationWarning
        />
        <button className="btn" onClick={() => check()} disabled={stage === "checking" || !code.trim()}>
          {stage === "checking" ? <Spinner size={20} /> : "Check"}
        </button>
      </div>

      {!scanning ? (
        <button type="button" className="btn sm mt-2 block w-full" onClick={() => setScanning(true)}>
          Scan QR instead
        </button>
      ) : (
        <QrScanner onScan={onScan} onClose={() => setScanning(false)} />
      )}

      {error ? <p className="mt-3 text-sm font-bold text-gum">{error}</p> : null}

      {result ? (
        <div className="card-hard pop-in mt-4 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
          {result.status === "active" ? (
            <>
              <p className="text-xs font-extrabold text-soft">{result.brandName}</p>
              <p className="text-xl font-extrabold">{result.rewardName}</p>
              <p className="mt-1 text-sm font-bold text-soft">
                {result.playerName ? `${result.playerName} · ` : ""}valid until {dateOf(result.expiresAt)}
              </p>
              <button className="btn go block mt-4" onClick={confirm} disabled={stage === "redeeming"}>
                {stage === "redeeming" ? (
                  <>
                    <Spinner size={20} /> Redeeming…
                  </>
                ) : (
                  "Confirm redemption"
                )}
              </button>
            </>
          ) : (
            <>
              <p className="text-xl font-extrabold">
                {result.status === "unknown"
                  ? "No such code"
                  : result.status === "expired"
                    ? "Expired"
                    : result.status === "wrong_brand"
                      ? "Wrong brand"
                      : "Already used"}
              </p>
              <p className="mt-1 text-sm font-bold text-soft">
                {result.status === "unknown"
                  ? "Check the code and try again."
                  : result.status === "expired"
                    ? `${result.rewardName} — expired on ${dateOf(result.expiresAt)}.`
                    : result.status === "wrong_brand"
                      ? `That's a ${result.brandName} voucher. It can't be used here.`
                      : `${result.rewardName} — taken${result.storeName ? ` at ${result.storeName}` : ""} at ${timeOf(result.redeemedAt)}.`}
              </p>
              <button className="btn mt-4" onClick={reset}>
                Try another
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function UndoButton({ redemptionId }: { redemptionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await undoRedemption(redemptionId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't undo that.");
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button className="btn sm" onClick={run} disabled={busy}>
        {busy ? <Spinner size={16} /> : "Undo"}
      </button>
      {error ? <p className="mt-1 text-xs font-bold text-gum">{error}</p> : null}
    </div>
  );
}
