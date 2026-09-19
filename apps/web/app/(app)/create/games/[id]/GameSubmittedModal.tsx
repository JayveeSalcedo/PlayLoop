"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SuccessModal } from "@/app/_components/SuccessModal";
import { icon } from "@playloop/ui";

export function GameSubmittedModal({
  gameTitle,
  slug,
}: {
  gameTitle: string;
  slug: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) return null;

  const handleDismiss = () => {
    setIsOpen(false);
    if (typeof window !== "undefined") {
      router.replace(window.location.pathname);
    }
  };

  return (
    <SuccessModal
      isOpen={isOpen}
      onClose={handleDismiss}
      title="🚀 Game Submitted for Review!"
      badgeText="Queue SLA: < 24 Hours"
      iconHtml={icon("spark")}
      accentColor="mint"
      confetti={true}
      soundEffect="victory"
      primaryAction={{
        label: "Copy Preview Link",
        onClick: async () => {
          const url = typeof window !== "undefined" ? `${window.location.origin}/play/${slug}` : `/play/${slug}`;
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            // ignore
          }
        },
      }}
      secondaryAction={{
        label: "Go to My Games",
        onClick: () => {
          router.push("/create/games");
        },
      }}
    >
      <div className="flex flex-col gap-3 text-left">
        <div className="rounded-2xl bg-paper p-3 border-2 border-ink shadow-hard-sm">
          <p className="text-xs font-bold text-soft">{gameTitle}</p>
          <p className="text-sm font-extrabold text-ink mt-0.5">Submitted to review queue</p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-soft font-semibold">
            <span>⏱️ Review turnaround:</span>
            <span className="font-bold text-ink">within 24 hours</span>
          </div>
        </div>
        <div className="rounded-2xl bg-mint/20 p-3 border-2 border-ink text-xs font-semibold">
          💰 <span className="font-bold">Creator Royalties:</span> AED 0.02 per play + 30% sponsor reward pool once published live.
        </div>
      </div>
    </SuccessModal>
  );
}
