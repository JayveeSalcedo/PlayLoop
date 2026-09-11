import { avatar } from "@playloop/ui";
import { completeOnboarding } from "./actions";

const AVATAR_COUNT = 6;
const INTERESTS = ["Quizzes", "Arcade", "Puzzles", "Food and coffee", "Sport", "Culture", "Music"];

export default function OnboardingPage() {
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Make your player</h1>
      <form action={completeOnboarding} className="mt-6 flex flex-col gap-6">
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

        <button type="submit" className="btn go lg block">
          Continue
        </button>
      </form>
    </main>
  );
}
