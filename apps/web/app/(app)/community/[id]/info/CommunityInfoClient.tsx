"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { avatar, icon } from "@playloop/ui";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { CommunityMemberItem, JoinRequestItem } from "@/lib/communities";
import {
  approveJoinRequestAction,
  deleteCommunityAction,
  demoteMemberAction,
  leaveCommunityAction,
  promoteMemberAction,
  rejectJoinRequestAction,
  removeMemberAction,
  updateCommunityAction,
} from "../../actions";
import { Spinner } from "@/app/_components/Spinner";

interface CommunityDetail {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isPublic: boolean;
  requiresApproval: boolean;
  inviteCode: string;
}

export function CommunityInfoClient({
  community,
  members,
  weeklyPointsByProfileId,
  viewerProfileId,
  viewerRole,
  joinRequests,
}: {
  community: CommunityDetail;
  members: CommunityMemberItem[];
  weeklyPointsByProfileId: Record<string, number>;
  viewerProfileId: string;
  viewerRole: string;
  joinRequests: JoinRequestItem[];
}) {
  const router = useRouter();
  const isAdmin = viewerRole === "admin";
  const [copied, setCopied] = useState(false);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(community.name);
  const [editDescription, setEditDescription] = useState(community.description ?? "");
  const [editIsPublic, setEditIsPublic] = useState(community.isPublic);
  const [editRequiresApproval, setEditRequiresApproval] = useState(community.requiresApproval);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const leaderboard = [...members]
    .map((m) => ({ ...m, weeklyPoints: weeklyPointsByProfileId[m.profileId] ?? 0 }))
    .sort((a, b) => b.weeklyPoints - a.weeklyPoints);

  // Realtime: a new join request lands, or another admin/tab resolves one,
  // without waiting for this admin to refresh. Just re-fetches the page's
  // server data (listJoinRequests already does the name/avatar lookup) —
  // simpler and less error-prone than reconstructing a request row client-side
  // from a bare INSERT/UPDATE payload.
  useEffect(() => {
    if (!isAdmin) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return; // Realtime not configured — admin still sees requests on manual refresh.

    const channel = supabase
      .channel(`community-join-requests-${community.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_join_requests", filter: `community_id=eq.${community.id}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "community_join_requests", filter: `community_id=eq.${community.id}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, community.id, router]);

  function handleCopyCode() {
    navigator.clipboard.writeText(community.inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function handlePromote(profileId: string) {
    setBusyProfileId(profileId);
    await promoteMemberAction(community.id, profileId);
    setBusyProfileId(null);
    router.refresh();
  }

  async function handleDemote(profileId: string) {
    setBusyProfileId(profileId);
    await demoteMemberAction(community.id, profileId);
    setBusyProfileId(null);
    router.refresh();
  }

  async function handleRemove(profileId: string) {
    setBusyProfileId(profileId);
    await removeMemberAction(community.id, profileId);
    setBusyProfileId(null);
    router.refresh();
  }

  async function handleApprove(requestId: string) {
    setBusyRequestId(requestId);
    await approveJoinRequestAction(community.id, requestId);
    setBusyRequestId(null);
    router.refresh();
  }

  async function handleReject(requestId: string) {
    setBusyRequestId(requestId);
    await rejectJoinRequestAction(community.id, requestId);
    setBusyRequestId(null);
    router.refresh();
  }

  async function handleLeave() {
    setLeaving(true);
    const result = await leaveCommunityAction(community.id);
    if (result.ok) {
      router.push("/community");
    } else {
      setLeaving(false);
    }
  }

  async function handleDelete() {
    const result = await deleteCommunityAction(community.id);
    if (result.ok) router.push("/community");
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEditPending(true);
    setEditError(null);
    const result = await updateCommunityAction(community.id, {
      name: editName.trim(),
      description: editDescription.trim(),
      isPublic: editIsPublic,
      requiresApproval: editIsPublic ? editRequiresApproval : false,
    });
    setEditPending(false);
    if (!result.ok) {
      setEditError(result.error ?? "Could not update the group.");
      return;
    }
    setShowEdit(false);
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Link href={`/community/${community.id}`} aria-label="Back to chat">
          <span dangerouslySetInnerHTML={{ __html: icon("back") }} />
        </Link>
        <h1 className="text-xl font-extrabold tracking-tight">Group Info</h1>
      </div>

      <div className="card-hard rounded-3xl bg-card p-5 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-ink">{community.name}</h2>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-paper [border:var(--border-thick)]"
              aria-label="Edit group"
            >
              <span className="h-4 w-4" dangerouslySetInnerHTML={{ __html: icon("edit") }} />
            </button>
          )}
        </div>
        {community.description && <p className="mt-1 text-sm font-semibold text-soft">{community.description}</p>}
        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-soft">
          <span className="h-3.5 w-3.5" dangerouslySetInnerHTML={{ __html: icon(community.isPublic ? "globe" : "lock") }} />
          {community.isPublic ? "Public" : "Private"}
          {community.isPublic && community.requiresApproval ? " · Requires approval" : ""}
        </p>

        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border-2 border-ink bg-paper p-3 shadow-hard-sm">
          <div>
            <p className="text-xs font-bold text-soft">Invite code</p>
            <p className="font-mono text-xl font-black tracking-widest text-ink">{community.inviteCode}</p>
          </div>
          <button type="button" onClick={handleCopyCode} className="btn sm">
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {isAdmin && joinRequests.length > 0 && (
        <div className="card-hard rounded-2xl bg-card p-4 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-soft">
            Join Requests ({joinRequests.length})
          </h3>
          <div className="mt-3 flex flex-col gap-2">
            {joinRequests.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-xl bg-paper p-2 [border:1.5px_solid_var(--ink)]">
                <span className="h-8 w-8 shrink-0" dangerouslySetInnerHTML={{ __html: avatar(r.avatarIndex, 32) }} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{r.name ?? "Player"}</span>
                {busyRequestId === r.id ? (
                  <Spinner size={16} />
                ) : (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => handleApprove(r.id)} className="btn sm">
                      Approve
                    </button>
                    <button type="button" onClick={() => handleReject(r.id)} className="btn sm">
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-soft">Weekly Leaderboard</h3>
        <div className="mt-3 flex flex-col gap-2">
          {leaderboard.map((m, idx) => (
            <div
              key={m.profileId}
              className="card-hard flex items-center gap-3 rounded-xl bg-card p-3 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]"
            >
              <span className="w-5 shrink-0 text-center text-sm font-extrabold text-soft">{idx + 1}</span>
              <span className="h-8 w-8 shrink-0" dangerouslySetInnerHTML={{ __html: avatar(m.avatarIndex, 32) }} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{m.name ?? "Player"}</span>
              <span className="shrink-0 text-sm font-extrabold text-ink">{m.weeklyPoints.toLocaleString()} pts</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-soft">Members ({members.length})</h3>
        <div className="mt-3 flex flex-col gap-2">
          {members.map((m) => {
            const isSelf = m.profileId === viewerProfileId;
            const busy = busyProfileId === m.profileId;
            return (
              <div
                key={m.profileId}
                className="card-hard flex items-center gap-3 rounded-xl bg-card p-3 [border:var(--border-thick)] [box-shadow:var(--shadow-sm)]"
              >
                <span className="h-8 w-8 shrink-0" dangerouslySetInnerHTML={{ __html: avatar(m.avatarIndex, 32) }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">
                    {m.name ?? "Player"} {isSelf ? "(You)" : ""}
                  </p>
                  <p className="text-xs font-semibold text-soft">{m.role === "admin" ? "Admin" : "Member"}</p>
                </div>
                {isAdmin && !isSelf && (
                  <div className="flex shrink-0 gap-1">
                    {busy ? (
                      <Spinner size={16} />
                    ) : m.role === "admin" ? (
                      <button type="button" onClick={() => handleDemote(m.profileId)} className="btn sm">
                        Demote
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => handlePromote(m.profileId)} className="btn sm">
                          Promote
                        </button>
                        <button type="button" onClick={() => handleRemove(m.profileId)} className="btn sm">
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={handleLeave} disabled={leaving} className="btn">
          {leaving ? <Spinner size={16} /> : "Leave Group"}
        </button>
        {isAdmin && (
          <button type="button" onClick={handleDelete} className="btn text-gum">
            Delete Group
          </button>
        )}
      </div>

      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-xs">
          <div className="card-hard w-full max-w-sm rounded-3xl bg-paper p-5 [border:var(--border-thick)] [box-shadow:var(--shadow-lg)]">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold tracking-tight">Edit Group</h3>
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-card [border:var(--border-thick)]"
                aria-label="Close"
              >
                <span dangerouslySetInnerHTML={{ __html: icon("close") }} />
              </button>
            </div>

            {editError && <p className="mt-2 text-xs font-bold text-gum">{editError}</p>}

            <form onSubmit={handleEditSubmit} className="mt-4 flex flex-col gap-3">
              <div>
                <label className="text-xs font-extrabold text-soft">Group Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-card p-2.5 text-sm font-bold [border:var(--border-thick)]"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-extrabold text-soft">Description</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-card p-2.5 text-sm font-bold [border:var(--border-thick)]"
                />
              </div>
              <label className="flex items-center justify-between rounded-xl bg-card p-2.5 [border:var(--border-thick)]">
                <span className="flex items-center gap-1.5 text-xs font-extrabold text-soft">
                  <span className="h-3.5 w-3.5" dangerouslySetInnerHTML={{ __html: icon("globe") }} />
                  Public (discoverable in search)
                </span>
                <input type="checkbox" checked={editIsPublic} onChange={(e) => setEditIsPublic(e.target.checked)} className="h-5 w-5" />
              </label>
              {editIsPublic && (
                <label className="flex items-center justify-between rounded-xl bg-card p-2.5 [border:var(--border-thick)]">
                  <span className="flex items-center gap-1.5 text-xs font-extrabold text-soft">
                    <span className="h-3.5 w-3.5" dangerouslySetInnerHTML={{ __html: icon("lock") }} />
                    Require approval to join
                  </span>
                  <input
                    type="checkbox"
                    checked={editRequiresApproval}
                    onChange={(e) => setEditRequiresApproval(e.target.checked)}
                    className="h-5 w-5"
                  />
                </label>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setShowEdit(false)} className="btn flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={editPending} className="btn go flex-1">
                  {editPending ? <Spinner size={16} /> : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
