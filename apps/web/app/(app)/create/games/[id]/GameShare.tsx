"use client";

import { icon } from "@playloop/ui";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { gameShareQrSvg } from "./shareActions";

type Stage = "idle" | "loading" | "ready" | "error";

/**
 * A game's shareable link + QR, shown once it's approved and live in the
 * feed. Built on demand (not in a mount effect) so the URL — which needs
 * window.location.origin, same reasoning as ChallengeShare — is only ever
 * touched client-side, after a click.
 */
export function GameShare({ slug }: { slug: string }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function start() {
    setStage("loading");
    const shareUrl = `${window.location.origin}/play/${slug}`;
    try {
      const qr = await gameShareQrSvg(shareUrl);
      setUrl(shareUrl);
      setSvg(qr);
      setStage("ready");
      if (navigator.share) {
        try {
          await navigator.share({ url: shareUrl, title: "Play this on playloop" });
        } catch {
          // user cancelled the native share sheet — fine, link's shown below
        }
      }
    } catch {
      setStage("error");
    }
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card-hard mt-4 rounded-2xl bg-card p-4 [border:var(--border-thick)]">
      <p className="font-extrabold">Share this game</p>
      <p className="mt-1 text-sm font-bold text-soft">Anyone with the link or QR can jump straight in.</p>

      {stage === "idle" ? (
        <button onClick={start} className="btn mt-3 block">
          <span dangerouslySetInnerHTML={{ __html: icon("link") }} /> Get share link
        </button>
      ) : null}

      {stage === "loading" ? (
        <button disabled className="btn mt-3 block">
          <Spinner size={20} />
        </button>
      ) : null}

      {stage === "error" ? (
        <button onClick={start} className="btn mt-3 block">
          Couldn&apos;t make a link — try again
        </button>
      ) : null}

      {stage === "ready" && url ? (
        <>
          {svg ? (
            <div
              className="mt-3 flex justify-center rounded-xl bg-white p-3 [border:var(--border-thick)]"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : null}
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-paper p-3 [border:var(--border-thick)]">
            <p className="flex-1 truncate text-sm font-bold">{url}</p>
            <button onClick={copy} className="btn sm">
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
