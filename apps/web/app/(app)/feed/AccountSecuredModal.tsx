"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SuccessModal } from "@/app/_components/SuccessModal";
import { icon } from "@playloop/ui";

export function AccountSecuredModal({
  email,
  pointsBalance,
  level,
}: {
  email?: string | null;
  pointsBalance: number;
  level: number;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) return null;

  const handleDismiss = () => {
    setIsOpen(false);
    router.replace("/feed");
  };

  return (
    <SuccessModal
      isOpen={isOpen}
      onClose={handleDismiss}
      title="Account Secured with OnePass!"
      badgeText="OnePass ID Verified"
      iconHtml={icon("spark")}
      accentColor="lemon"
      confetti={true}
      soundEffect="victory"
      primaryAction={{
        label: "Explore Games",
        onClick: handleDismiss,
      }}
      secondaryAction={{
        label: "Open My Wallet",
        onClick: () => {
          setIsOpen(false);
          router.replace("/feed");
          router.push("/wallet");
        },
      }}
    >
      <div className="flex flex-col gap-3 text-left">
        <div className="rounded-2xl bg-paper p-3 border-2 border-ink shadow-hard-sm">
          <p className="text-xs font-bold text-soft">Linked Email Account</p>
          <p className="text-sm font-extrabold text-ink truncate">{email || "Your OnePass ID"}</p>
          <div className="mt-2 flex justify-between border-t-2 border-ink/10 pt-2 text-xs font-bold">
            <span className="text-soft">Preserved Balance</span>
            <span className="flex items-center gap-1 font-extrabold text-ink">
              <span className="coin sm" aria-hidden="true" />
              {pointsBalance.toLocaleString("en-US")} pts · Level {level}
            </span>
          </div>
        </div>
        <p className="text-xs text-soft font-semibold text-center">
          All your progress, streak XP, and arcade points are permanently synced and protected.
        </p>
      </div>
    </SuccessModal>
  );
}
