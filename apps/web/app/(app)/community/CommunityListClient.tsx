"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { icon } from "@playloop/ui";
import type { CommunityListItem } from "@/lib/communities";
import { createCommunityAction, joinCommunityByCodeAction, requestToJoinCommunityAction } from "./actions";
import { ArenaScanButton } from "../_components/ArenaScanButton";
import { Spinner } from "@/app/_components/Spinner";
import { SuccessModal } from "@/app/_components/SuccessModal";

export function CommunityListClient({ joined, open }: { joined: CommunityListItem[]; open: CommunityListItem[] }) {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createIsPublic, setCreateIsPublic] = useState(false);
  const [createRequiresApproval, setCreateRequiresApproval] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [joinPending, setJoinPending] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [pendingJoinId, setPendingJoinId] = useState<string | null>(null);
  const [joinStatusById, setJoinStatusById] = useState<Record<string, "joined" | "pending">>({});

  const [createdCommunity, setCreatedCommunity] = useState<{ name: string; inviteCode: string; id: string } | null>(null);

  const filteredOpen = query.trim()
    ? open.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : open;

  async function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!createName.trim()) {
      setCreateError("Give your group a name.");
      return;
    }
    setCreatePending(true);
    setCreateError(null);

    const result = await createCommunityAction({
      name: createName.trim(),
      description: createDescription.trim() || undefined,
      isPublic: createIsPublic,
      requiresApproval: createIsPublic ? createRequiresApproval : false,
    });
    setCreatePending(false);

    if (!result.ok || !result.community) {
      setCreateError(result.error ?? "Could not create the group.");
      return;
    }

    setShowCreateModal(false);
    setCreatedCommunity({ name: result.community.name, inviteCode: result.community.inviteCode, id: result.community.id });
    setCreateName("");
    setCreateDescription("");
    setCreateIsPublic(false);
    setCreateRequiresApproval(false);
  }

  async function handleJoinSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoinPending(true);
    setJoinError(null);

    const result = await joinCommunityByCodeAction(joinCode.trim());
    setJoinPending(false);

    if (!result.ok || !result.community) {
      setJoinError(result.error ?? "Could not join that group.");
      return;
    }

    setJoinCode("");
    router.push(`/community/${result.community.id}`);
  }

  async function handleRequestJoin(communityId: string) {
    setPendingJoinId(communityId);
    const result = await requestToJoinCommunityAction(communityId);
    setPendingJoinId(null);
    if (result.ok && result.status) {
      setJoinStatusById((prev) => ({ ...prev, [communityId]: result.status! }));
    }
  }

  return (
    <div className="fade-in mx-auto max-w-md p-4 pb-28 flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Community</h1>

      <ArenaScanButton />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-soft">Your Groups ({joined.length})</h3>
        <button type="button" onClick={() => setShowCreateModal(true)} className="btn sm">
          + Create Group
        </button>
      </div>

      {joined.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-ink/30 p-6 text-center text-sm font-semibold text-soft">
          You haven&apos;t joined any groups yet. Create one, join with a code below, or discover a public group.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {joined.map((c) => (
            <Link
              key={c.id}
              href={`/community/${c.id}`}
              className="card-hard flex items-center gap-3 overflow-hidden rounded-2xl bg-card p-4 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)] transition-transform active:scale-[0.99]"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-lemon [border:var(--border-thick)]"
                style={c.imageUrl ? { backgroundImage: `url(${c.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
              >
                {!c.imageUrl && <span dangerouslySetInnerHTML={{ __html: icon("msg") }} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold text-ink">{c.name}</p>
                <p className="text-xs font-semibold text-soft">
                  {c.memberCount} member{c.memberCount === 1 ? "" : "s"} · {c.isPublic ? "Public" : "Private"}
                  {c.role === "admin" ? " · Admin" : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-soft">Join via Code</h3>
        <form onSubmit={handleJoinSubmit} className="mt-2 flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="e.g. A3F1B2"
            maxLength={8}
            className="flex-1 rounded-xl bg-paper p-2.5 text-sm font-bold uppercase tracking-widest [border:var(--border-thick)]"
          />
          <button type="submit" disabled={joinPending} className="btn go">
            {joinPending ? <Spinner size={16} /> : "Join"}
          </button>
        </form>
        {joinError && <p className="mt-2 text-xs font-bold text-gum">{joinError}</p>}
      </div>

      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-soft">Discover Public Groups</h3>
        <div className="relative mt-2">
          <span
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-soft"
            dangerouslySetInnerHTML={{ __html: icon("search") }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search groups..."
            className="w-full rounded-xl bg-card py-2.5 pl-9 pr-2.5 text-sm font-bold [border:var(--border-thick)]"
          />
        </div>

        {filteredOpen.length === 0 ? (
          <p className="mt-3 text-center text-sm font-semibold text-soft">No public groups found.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {filteredOpen.map((c) => {
              const status = joinStatusById[c.id];
              const isPending = pendingJoinId === c.id;
              return (
                <div
                  key={c.id}
                  className="card-hard flex items-center gap-3 overflow-hidden rounded-2xl bg-card p-4 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold text-ink">{c.name}</p>
                    <p className="text-xs font-semibold text-soft">
                      {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
                      {c.requiresApproval ? " · Requires approval" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isPending || status === "pending" || status === "joined"}
                    onClick={() => handleRequestJoin(c.id)}
                    className="btn sm shrink-0"
                  >
                    {isPending ? (
                      <Spinner size={14} />
                    ) : status === "pending" ? (
                      "Requested"
                    ) : status === "joined" ? (
                      "Joined"
                    ) : c.requiresApproval ? (
                      "Request"
                    ) : (
                      "Join"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-xs">
          <div className="card-hard w-full max-w-sm rounded-3xl bg-paper p-5 [border:var(--border-thick)] [box-shadow:var(--shadow-lg)]">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold tracking-tight">Create a Group</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-card [border:var(--border-thick)]"
                aria-label="Close"
              >
                <span dangerouslySetInnerHTML={{ __html: icon("close") }} />
              </button>
            </div>

            <p className="mt-1 text-xs font-semibold text-soft">
              Start a group to chat, share games, and challenge each other.
            </p>

            {createError && <p className="mt-2 text-xs font-bold text-gum">{createError}</p>}

            <form onSubmit={handleCreateSubmit} className="mt-4 flex flex-col gap-3">
              <div>
                <label className="text-xs font-extrabold text-soft">Group Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Weekend Warriors"
                  className="mt-1 w-full rounded-xl bg-card p-2.5 text-sm font-bold [border:var(--border-thick)]"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-soft">Description (Optional)</label>
                <input
                  type="text"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="What's this group about?"
                  className="mt-1 w-full rounded-xl bg-card p-2.5 text-sm font-bold [border:var(--border-thick)]"
                />
              </div>

              <label className="flex items-center justify-between rounded-xl bg-card p-2.5 [border:var(--border-thick)]">
                <span className="flex items-center gap-1.5 text-xs font-extrabold text-soft">
                  <span className="h-3.5 w-3.5" dangerouslySetInnerHTML={{ __html: icon("globe") }} />
                  Public (discoverable in search)
                </span>
                <input
                  type="checkbox"
                  checked={createIsPublic}
                  onChange={(e) => setCreateIsPublic(e.target.checked)}
                  className="h-5 w-5"
                />
              </label>

              {createIsPublic && (
                <label className="flex items-center justify-between rounded-xl bg-card p-2.5 [border:var(--border-thick)]">
                  <span className="flex items-center gap-1.5 text-xs font-extrabold text-soft">
                    <span className="h-3.5 w-3.5" dangerouslySetInnerHTML={{ __html: icon("lock") }} />
                    Require approval to join
                  </span>
                  <input
                    type="checkbox"
                    checked={createRequiresApproval}
                    onChange={(e) => setCreateRequiresApproval(e.target.checked)}
                    className="h-5 w-5"
                  />
                </label>
              )}

              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={createPending} className="btn go flex-1">
                  {createPending ? <Spinner size={16} /> : "Create Group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createdCommunity && (
        <SuccessModal
          isOpen={Boolean(createdCommunity)}
          onClose={() => setCreatedCommunity(null)}
          title="Group Created!"
          badgeText="New Community"
          accentColor="mint"
          primaryAction={{
            label: "Open Group",
            onClick: () => {
              const id = createdCommunity.id;
              setCreatedCommunity(null);
              router.push(`/community/${id}`);
            },
          }}
        >
          <div className="w-full rounded-2xl border-2 border-ink bg-paper p-3 text-left shadow-hard-sm">
            <h3 className="text-lg font-black text-ink">{createdCommunity.name}</h3>
            <p className="mt-1 text-xs font-bold text-soft">Invite code</p>
            <p className="font-mono text-xl font-black tracking-widest text-ink">{createdCommunity.inviteCode}</p>
          </div>
        </SuccessModal>
      )}
    </div>
  );
}
