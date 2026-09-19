"use client";

import { avatar, icon } from "@playloop/ui";
import { useState } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { createChallenge } from "./challengeActions";

type Stage = "idle" | "creating" | "ready" | "error";
type Friend = { id: string; name: string | null; avatarIndex: number; level: number };

/**
 * Challenge share flow from a completed play's result screen.
 * Shows a friend picker if friends exist (prototype's .flist), then
 * share buttons (Message / Story / Copy link) matching the prototype's .shr.
 */
export function ChallengeShare({
  sessionId,
  score,
  gameTitle,
  friends,
}: {
  sessionId: string;
  score: number;
  gameTitle: string;
  friends: Friend[];
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(
    new Set(friends[0] ? [friends[0].id] : []),
  );

  function toggleFriend(id: string) {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function start() {
    setStage("creating");
    try {
      const { code } = await createChallenge(sessionId);
      const shareUrl = `${window.location.origin}/c/${code}`;
      setUrl(shareUrl);
      setStage("ready");
    } catch {
      setStage("error");
    }
  }

  async function shareNative() {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ url, title: `Beat my ${score.toLocaleString("en-US")} on ${gameTitle}` });
      } catch {
        /* user cancelled */
      }
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
      <div className="w-full">
        {/* Friend picker — prototype's .flist */}
        {friends.length > 0 && (
          <>
            <p className="mb-2 text-xs font-extrabold text-soft">Send to</p>
            <div className="mb-3 flex flex-col gap-1.5">
              {friends.map((f) => {
                const on = selectedFriends.has(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleFriend(f.id)}
                    className={`flex items-center gap-2.5 rounded-2xl p-2.5 text-left transition-colors [border:var(--border-thick)] ${
                      on ? "bg-gum/20" : "bg-card"
                    }`}
                  >
                    <span dangerouslySetInnerHTML={{ __html: avatar(f.avatarIndex, 36) }} />
                    <div className="flex-1">
                      <b className="text-sm">{f.name ?? "Player"}</b>
                      <p className="text-[11px] font-bold text-soft">Level {f.level}</p>
                    </div>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-lg text-[14px] [border:2.5px_solid_var(--ink)] ${
                        on ? "bg-gum" : "bg-paper"
                      }`}
                    >
                      {on ? <span dangerouslySetInnerHTML={{ __html: icon("check") }} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <button onClick={start} className="btn gum block w-full text-sm font-extrabold">
          <span dangerouslySetInnerHTML={{ __html: icon("users") }} />{" "}
          {selectedFriends.size > 1 ? `Send to ${selectedFriends.size} friends` : "Challenge a friend"}
        </button>
      </div>
    );
  }

  if (stage === "creating") {
    return (
      <button disabled className="btn block w-full">
        <Spinner size={20} />
      </button>
    );
  }

  if (stage === "error") {
    return (
      <button onClick={start} className="btn block w-full">
        Couldn&apos;t create link — try again
      </button>
    );
  }

  // "ready" — show share options (prototype's .shr)
  return (
    <div className="w-full">
      <div className="pop-in card-hard rounded-2xl bg-card p-3 [border:var(--border-thick)]">
        <p className="text-xs font-bold text-soft">Challenge link</p>
        <p className="mt-1 truncate font-mono text-sm font-bold">{url}</p>
      </div>

      {/* Share buttons — prototype's .shr (Message / Story / Link) */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          onClick={shareNative}
          className="flex flex-col items-center gap-1 rounded-2xl bg-card p-2.5 text-[12px] font-bold [border:var(--border-thick)]"
        >
          <span className="text-lg" dangerouslySetInnerHTML={{ __html: icon("msg") }} />
          Message
        </button>
        <button
          onClick={shareNative}
          className="flex flex-col items-center gap-1 rounded-2xl bg-card p-2.5 text-[12px] font-bold [border:var(--border-thick)]"
        >
          <span className="text-lg" dangerouslySetInnerHTML={{ __html: icon("story") }} />
          Story
        </button>
        <button
          onClick={copy}
          className="flex flex-col items-center gap-1 rounded-2xl bg-card p-2.5 text-[12px] font-bold [border:var(--border-thick)]"
        >
          <span className="text-lg" dangerouslySetInnerHTML={{ __html: icon("link") }} />
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
