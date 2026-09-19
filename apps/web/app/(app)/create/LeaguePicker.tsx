"use client";

import { icon, type IconName } from "@playloop/ui";

export interface LeagueOption {
  id: string;
  name: string;
  kind: string;
  icon: string;
  color: string;
  memberCount: number;
}

const KIND_ICON: Record<string, IconName> = {
  school: "book",
  company: "briefcase",
  mall: "bag",
  family: "heart",
  community: "trophy",
};

const KIND_DESC: Record<string, string> = {
  school: "Members only. Approved by your school.",
  company: "Members only. For your team.",
  mall: "Members only. Approved by the mall team.",
  family: "Members only. Goes live straight away.",
  community: "Members only. Goes live straight away.",
};

export function LeaguePicker({
  leagues,
  value,
  onChange,
}: {
  leagues: LeagueOption[];
  value: string | null;
  onChange: (leagueId: string | null) => void;
}) {
  const isPublic = value === null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-extrabold">Where should it go?</h3>

      <div className="grid grid-cols-2 gap-2.5">
        {/* Public feed option */}
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`flex items-start gap-2.5 rounded-2xl p-3.5 text-left transition-all active:scale-[0.97] ${
            isPublic
              ? "bg-lemon [border:2.5px_solid_var(--ink)] shadow-[2px_2px_0_var(--ink)]"
              : "bg-violet/10 [border:2.5px_solid_var(--ink)] hover:bg-violet/20"
          }`}
        >
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-ink ${
              isPublic ? "[border:2px_solid_var(--ink)] bg-lemon" : "[border:2px_solid_var(--ink)] bg-violet/20"
            }`}
            dangerouslySetInnerHTML={{ __html: icon("home") }}
          />
          <div className="min-w-0">
            <p className="text-sm font-extrabold leading-tight">Public feed</p>
            <p className="mt-0.5 text-[11px] font-bold leading-snug text-soft">
              Everyone can play. Brands can sponsor it.
            </p>
          </div>
        </button>

        {/* League options */}
        {leagues.map((l) => {
          const isSelected = value === l.id;
          const iconName = KIND_ICON[l.kind] ?? "trophy";
          const desc = KIND_DESC[l.kind] ?? "Members only. Goes live straight away.";

          return (
            <button
              key={l.id}
              type="button"
              onClick={() => onChange(l.id)}
              className={`flex items-start gap-2.5 rounded-2xl p-3.5 text-left transition-all active:scale-[0.97] ${
                isSelected
                  ? "bg-lemon [border:2.5px_solid_var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                  : "bg-violet/10 [border:2.5px_solid_var(--ink)] hover:bg-violet/20"
              }`}
            >
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl [border:2px_solid_var(--ink)]"
                style={{ backgroundColor: isSelected ? "#FFDD3C" : l.color + "40" }}
                dangerouslySetInnerHTML={{ __html: icon(iconName) }}
              />
              <div className="min-w-0">
                <p className="text-sm font-extrabold leading-tight">{l.name}</p>
                <p className="mt-0.5 text-[11px] font-bold leading-snug text-soft">
                  {desc.replace("the mall team", `the ${l.name} team`)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
