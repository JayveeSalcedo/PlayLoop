"use client";

import { icon } from "@playloop/ui";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { createChallenge } from "./challengeActions";

type Stage = "idle" | "creating" | "ready" | "error";

/**
 * "Challenge a friend" from a completed play's result screen. Available
 * after any completed play (challenge-born or not), so this also doubles
 * as the rematch path without a separate rematch concept.
 */
export function ChallengeShare({ sessionId }: { sessionId: string }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function start() {
    setStage("creating");
    try {
      const { code } = await createChallenge(sessionId);
      const shareUrl = `${window.location.origin}/c/${code}`;
      setUrl(shareUrl);
      if (navigator.share) {
        try {
          await navigator.share({ url: shareUrl, title: "Beat my score on playloop" });
        } catch {
          // user cancelled the native share sheet — fine, just leave the link visible below
        }
      }
      setStage("ready");
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

  if (stage === "idle") {
    return (
      <button onClick={start} className="btn block">
        <span dangerouslySetInnerHTML={{ __html: icon("users") }} /> Challenge a friend
      </button>
    );
  }

  if (stage === "creating") {
    return (
      <button disabled className="btn block">
        <Spinner size={20} />
      </button>
    );
  }

  if (stage === "error") {
    return (
      <button onClick={start} className="btn block">
        Couldn&apos;t create a link — try again
      </button>
    );
  }

  return (
    <div className="card-hard pop-in flex w-full items-center gap-2 rounded-2xl bg-card p-3 [border:var(--border-thick)]">
      <p className="flex-1 truncate text-sm font-bold">{url}</p>
      <button onClick={copy} className="btn sm">
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
