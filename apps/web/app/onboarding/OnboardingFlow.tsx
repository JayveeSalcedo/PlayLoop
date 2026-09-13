"use client";

import { WELCOME_GIFT_BONUS } from "@playloop/economy";
import { avatar } from "@playloop/ui";
import { useState, type FormEvent } from "react";
import { Spinner } from "@/app/_components/Spinner";
import { completeOnboarding } from "./actions";

const AVATAR_COUNT = 6;
const INTERESTS = ["Quizzes", "Arcade", "Puzzles", "Food and coffee", "Sport", "Culture", "Music"];

export function OnboardingFlow({ challenge }: { challenge?: string }) {
  const [step, setStep] = useState<"profile" | "gift">("profile");
  const [profile, setProfile] = useState<FormData | null>(null);
  const [opened, setOpened] = useState(false);
  const [pending, setPending] = useState(false);

  function submitProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfile(new FormData(e.currentTarget));
    setStep("gift");
  }

  function finish() {
    if (!profile || pending) return;
    setPending(true);
    completeOnboarding(profile);
  }

  if (step === "gift") {
    const name = String(profile?.get("name") || "Nova");
    return (
      <main className="mx-auto flex max-w-sm flex-col items-center p-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">Welcome, {name}</h1>
        <p className="mt-2 font-bold text-soft">You&apos;ve got a gift for joining playloop</p>
        <button
          type="button"
          onClick={() => setOpened(true)}
          disabled={opened}
          aria-label="Open your welcome gift"
          className={`mt-8 flex h-36 w-36 items-center justify-center rounded-3xl bg-lemon text-6xl [border:var(--border-thick)] transition-transform ${
            opened ? "scale-105" : "active:scale-95"
          }`}
        >
          🎁
        </button>
        {opened ? (
          <div className="mt-6 rounded-2xl bg-lemon p-4 [border:var(--border-thick)]">
            <p className="text-4xl font-extrabold">+{WELCOME_GIFT_BONUS}</p>
            <p className="text-sm font-bold">points earned</p>
          </div>
        ) : (
          <p className="mt-6 text-sm font-bold text-soft">Tap the gift to open it</p>
        )}
        <button
          type="button"
          onClick={finish}
          disabled={!opened || pending}
          className="btn go lg block mt-8 w-full"
        >
          {pending ? (
            <>
              <Spinner size={22} /> Loading…
            </>
          ) : (
            "Continue"
          )}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Make your player</h1>
      <form onSubmit={submitProfile} className="mt-6 flex flex-col gap-6">
        {challenge ? <input type="hidden" name="challenge" value={challenge} /> : null}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-extrabold" htmlFor="name">
            Gamer name
          </label>
          <input
            id="name"
            name="name"
            defaultValue="Nova"
            maxLength={14}
            autoComplete="off"
            className="rounded-2xl bg-card p-3 font-semibold [border:var(--border-thick)]"
            // See the comment on the email input in app/login/page.tsx — some
            // browser extensions inject attributes onto inputs pre-hydration.
            suppressHydrationWarning
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-extrabold">Pick an avatar</span>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: AVATAR_COUNT }, (_, i) => (
              <label key={i} className="cursor-pointer">
                <input type="radio" name="avatarIndex" value={i} defaultChecked={i === 0} className="peer sr-only" />
                <div
                  className="rounded-2xl border-2 border-transparent p-1 peer-checked:border-ink peer-checked:bg-lemon"
                  dangerouslySetInnerHTML={{ __html: avatar(i, 52) }}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-extrabold">What do you like to play?</span>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((t) => (
              <label key={t} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="interests"
                  value={t}
                  defaultChecked={t === "Quizzes" || t === "Arcade"}
                  className="peer sr-only"
                />
                <span className="inline-block rounded-full border-2 border-ink px-3 py-2 text-sm font-bold peer-checked:bg-ink peer-checked:text-white">
                  {t}
                </span>
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className="btn go lg block" suppressHydrationWarning>
          Continue
        </button>
      </form>
    </main>
  );
}
