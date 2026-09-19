"use client";

import { avatar, icon } from "@playloop/ui";
import { useState } from "react";
import { updateProfile } from "./actions";
import { Spinner } from "@/app/_components/Spinner";

const AVATAR_COUNT = 6;
const AVAILABLE_INTERESTS = [
  "Quizzes",
  "Arcade",
  "Puzzles",
  "Food and coffee",
  "Sport",
  "Culture",
  "Music",
];

export function ProfileCard({
  profile,
}: {
  profile: {
    id: string;
    name: string | null;
    avatarIndex: number;
    email: string;
    isGuest: boolean;
    interests: string[];
    level: number;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name ?? "Player");
  const [avatarIndex, setAvatarIndex] = useState(profile.avatarIndex);
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleInterest(t: string) {
    setInterests((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Name cannot be empty");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await updateProfile({
        name: name.trim(),
        avatarIndex,
        interests,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to save profile");
        setSaving(false);
      } else {
        setSaving(false);
        setEditing(false);
      }
    } catch {
      setError("Something went wrong");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-card p-3 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
        <div className="flex items-center gap-3">
          <div
            className="flex-shrink-0"
            dangerouslySetInnerHTML={{ __html: avatar(profile.avatarIndex, 48) }}
          />
          <div>
            <div className="flex items-center gap-2">
              <b className="text-base font-extrabold">{profile.name ?? "Player"}</b>
              {profile.isGuest ? (
                <span className="rounded-md bg-lemon px-1.5 py-0.5 text-[10px] font-extrabold text-ink [border:1.5px_solid_var(--ink)]">
                  Guest
                </span>
              ) : (
                <span className="rounded-md bg-mint/30 px-1.5 py-0.5 text-[10px] font-extrabold text-ink [border:1.5px_solid_var(--ink)]">
                  Verified
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-soft truncate max-w-[180px]">
              {profile.isGuest ? "Unclaimed account" : profile.email}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setName(profile.name ?? "Player");
            setAvatarIndex(profile.avatarIndex);
            setInterests(profile.interests ?? []);
            setError(null);
            setEditing(true);
          }}
          className="btn sm"
        >
          Edit
        </button>
      </div>

      {/* Edit Profile Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-xs">
          <div className="card-hard w-full max-w-sm rounded-3xl bg-paper p-5 [border:var(--border-thick)] [box-shadow:var(--shadow-lg)]">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold tracking-tight">Edit Profile</h2>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl [border:var(--border-thick)] bg-card"
                aria-label="Close"
              >
                <span dangerouslySetInnerHTML={{ __html: icon("close") }} />
              </button>
            </div>

            {error && (
              <p className="mt-2 text-xs font-bold text-[#D81B5B]">{error}</p>
            )}

            {/* Avatar picker */}
            <div className="mt-4">
              <label className="text-xs font-extrabold text-soft">Choose Avatar</label>
              <div className="mt-2 grid grid-cols-6 gap-2">
                {Array.from({ length: AVATAR_COUNT }, (_, i) => {
                  const selected = avatarIndex === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAvatarIndex(i)}
                      className={`flex items-center justify-center rounded-2xl p-1 transition-transform [border:2px_solid_transparent] ${
                        selected
                          ? "bg-lemon !border-ink scale-105"
                          : "bg-card hover:bg-paper"
                      }`}
                    >
                      <span dangerouslySetInnerHTML={{ __html: avatar(i, 40) }} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Gamer Name input */}
            <div className="mt-4">
              <label htmlFor="edit-name" className="text-xs font-extrabold text-soft">
                Gamer Name
              </label>
              <input
                id="edit-name"
                type="text"
                maxLength={14}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-2xl bg-card p-3 font-bold [border:var(--border-thick)]"
                placeholder="Enter name"
              />
            </div>

            {/* Interests chips */}
            <div className="mt-4">
              <label className="text-xs font-extrabold text-soft">
                Interests
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {AVAILABLE_INTERESTS.map((t) => {
                  const on = interests.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleInterest(t)}
                      className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors [border:1.5px_solid_var(--ink)] ${
                        on ? "bg-ink text-white" : "bg-card text-ink"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="btn flex-1"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="btn go flex-1"
                disabled={saving}
              >
                {saving ? <Spinner size={18} /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
