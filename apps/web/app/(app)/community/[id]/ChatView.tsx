"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { icon } from "@playloop/ui";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { CommunityMemberItem, CommunityMessageItem, PublishedGameItem, ReactionSummary } from "@/lib/communities";
import {
  getOlderMessagesAction,
  listPublishedGamesAction,
  requestToJoinCommunityAction,
  sendMessageAction,
  shareGameInChatAction,
  toggleReactionAction,
  uploadCommunityImageAction,
} from "../actions";
import { shrinkForUpload } from "../imageResize";
import { Spinner } from "@/app/_components/Spinner";

const REACTION_EMOJIS = ["🔥", "😂", "❤️", "👍", "😮"];

interface CommunitySummary {
  id: string;
  name: string;
  imageUrl: string | null;
  isPublic: boolean;
  requiresApproval: boolean;
}

type SentMessage = {
  id: string;
  communityId: string;
  senderId: string;
  content: string;
  messageType: CommunityMessageItem["messageType"];
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export function ChatView({
  community,
  viewerProfileId,
  role,
  members,
  initialMessages,
}: {
  community: CommunitySummary;
  viewerProfileId: string;
  role: string | null;
  members: CommunityMemberItem[];
  initialMessages: CommunityMessageItem[];
}) {
  const router = useRouter();
  const isMember = role !== null;
  const [messages, setMessages] = useState<CommunityMessageItem[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialMessages.length >= 30);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [gamePickerMode, setGamePickerMode] = useState<"share" | "challenge" | null>(null);
  const [games, setGames] = useState<PublishedGameItem[] | null>(null);
  const [reactMessageId, setReactMessageId] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<"idle" | "pending">("idle");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const profileById = new Map(members.map((m) => [m.profileId, { name: m.name, avatarIndex: m.avatarIndex }]));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, []);

  useEffect(() => {
    if (!isMember) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return; // Realtime not configured yet — chat still works, just without live push.
    const channel = supabase
      .channel(`community-${community.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages", filter: `community_id=eq.${community.id}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            community_id: string;
            sender_id: string;
            content: string;
            message_type: CommunityMessageItem["messageType"];
            metadata: Record<string, unknown>;
            created_at: string;
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const sender = profileById.get(row.sender_id);
            return [
              ...prev,
              {
                id: row.id,
                communityId: row.community_id,
                senderId: row.sender_id,
                senderName: sender?.name ?? null,
                senderAvatarIndex: sender?.avatarIndex ?? 0,
                content: row.content,
                messageType: row.message_type,
                metadata: row.metadata,
                createdAt: new Date(row.created_at),
                reactions: [],
              },
            ];
          });
          requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community.id, isMember]);

  // Realtime: the moment an admin approves this viewer, flip straight from
  // "waiting for approval" to the chat instead of leaving them on a stale
  // screen until they navigate away and back. router.refresh() re-runs the
  // server component's membership check, same as the poll-free pattern above.
  useEffect(() => {
    if (isMember) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return; // Realtime not configured — approval still takes effect on next visit.
    const channel = supabase
      .channel(`community-join-${community.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_members", filter: `community_id=eq.${community.id}` },
        (payload) => {
          const row = payload.new as { profile_id: string };
          if (row.profile_id === viewerProfileId) router.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isMember, community.id, viewerProfileId, router]);

  function appendOwnMessage(raw: SentMessage) {
    setMessages((prev) => {
      if (prev.some((m) => m.id === raw.id)) return prev;
      const sender = profileById.get(raw.senderId) ?? { name: null, avatarIndex: 0 };
      return [
        ...prev,
        {
          id: raw.id,
          communityId: raw.communityId,
          senderId: raw.senderId,
          senderName: sender.name,
          senderAvatarIndex: sender.avatarIndex,
          content: raw.content,
          messageType: raw.messageType,
          metadata: raw.metadata,
          createdAt: raw.createdAt,
          reactions: [],
        },
      ];
    });
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
  }

  async function handleLoadOlder() {
    if (messages.length === 0) return;
    setLoadingOlder(true);
    const older = await getOlderMessagesAction(community.id, messages[0]!.createdAt.toISOString());
    setLoadingOlder(false);
    if (older.length < 30) setHasMore(false);
    setMessages((prev) => [...older, ...prev]);
  }

  async function handleSendText(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setSending(true);
    setError(null);
    const result = await sendMessageAction(community.id, { content, messageType: "text" });
    setSending(false);
    if (!result.ok || !result.message) {
      setError(result.error ?? "Could not send message.");
      return;
    }
    setText("");
    appendOwnMessage(result.message);
  }

  async function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await shrinkForUpload(file);
      const formData = new FormData();
      formData.set("file", blob, "photo.jpg");
      const uploadResult = await uploadCommunityImageAction(formData);
      if (!uploadResult.ok || !uploadResult.url) {
        setError(uploadResult.error ?? "Upload failed.");
        return;
      }
      const sendResult = await sendMessageAction(community.id, { messageType: "image", metadata: { imageUrl: uploadResult.url } });
      if (!sendResult.ok || !sendResult.message) {
        setError(sendResult.error ?? "Could not send image.");
        return;
      }
      appendOwnMessage(sendResult.message);
    } catch (err: any) {
      setError(err?.message ?? "Could not process that image.");
    } finally {
      setUploading(false);
    }
  }

  async function openGamePicker(mode: "share" | "challenge") {
    setGamePickerMode(mode);
    if (!games) setGames(await listPublishedGamesAction());
  }

  async function handlePickGame(game: PublishedGameItem) {
    setGamePickerMode(null);
    if (gamePickerMode === "challenge") {
      router.push(`/play/${game.slug}?challengeCommunity=${community.id}`);
      return;
    }
    const result = await shareGameInChatAction(community.id, game.id);
    if (result.ok && result.message) appendOwnMessage(result.message);
    else setError(result.error ?? "Could not share that game.");
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    setReactMessageId(null);
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const existing = m.reactions.find((r) => r.emoji === emoji);
        let reactions: ReactionSummary[];
        if (existing) {
          reactions = existing.reactedByMe
            ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, reactedByMe: false } : r)).filter((r) => r.count > 0)
            : m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, reactedByMe: true } : r));
        } else {
          reactions = [...m.reactions, { emoji, count: 1, reactedByMe: true }];
        }
        return { ...m, reactions };
      }),
    );
    await toggleReactionAction(messageId, emoji);
  }

  async function handleRequestJoin() {
    setRequestStatus("pending");
    setError(null);
    const result = await requestToJoinCommunityAction(community.id);
    if (result.ok && result.status === "joined") {
      router.refresh();
      return;
    }
    if (result.ok && result.status === "pending") {
      setRequestStatus("pending");
      return;
    }
    setRequestStatus("idle");
    setError(result.error ?? "Could not join.");
  }

  if (!isMember) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 pb-28 text-center">
        <Link href="/community" className="self-start" aria-label="Back to Community">
          <span dangerouslySetInnerHTML={{ __html: icon("back") }} />
        </Link>
        <div className="mt-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-lemon [border:var(--border-thick)]">
          <span dangerouslySetInnerHTML={{ __html: icon("msg") }} />
        </div>
        <h1 className="text-xl font-extrabold">{community.name}</h1>
        {community.isPublic ? (
          <>
            <p className="text-sm font-semibold text-soft">Join this group to chat with its members.</p>
            <button type="button" onClick={handleRequestJoin} disabled={requestStatus !== "idle"} className="btn go">
              {requestStatus === "pending" ? "Request sent — waiting for approval" : community.requiresApproval ? "Request to Join" : "Join Group"}
            </button>
          </>
        ) : (
          <p className="text-sm font-semibold text-soft">This is a private group. Ask a member for its invite code from the Community tab.</p>
        )}
        {error && <p className="text-xs font-bold text-gum">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] max-w-md flex-col">
      <div className="flex items-center gap-3 border-b-2 border-ink/10 p-4">
        <Link href="/community" aria-label="Back to Community">
          <span dangerouslySetInnerHTML={{ __html: icon("back") }} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold text-ink">{community.name}</p>
          <p className="text-xs font-semibold text-soft">
            {members.length} member{members.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href={`/community/${community.id}/info`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card [border:var(--border-thick)]"
          aria-label="Group info"
        >
          <span dangerouslySetInnerHTML={{ __html: icon("users") }} />
        </Link>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {hasMore && (
          <button type="button" onClick={handleLoadOlder} disabled={loadingOlder} className="btn sm self-center">
            {loadingOlder ? <Spinner size={14} /> : "Load older messages"}
          </button>
        )}
        {messages.map((m) => {
          const isMe = m.senderId === viewerProfileId;
          return (
            <div key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
              {!isMe && <p className="ml-1 text-[11px] font-bold text-soft">{m.senderName ?? "Player"}</p>}
              <MessageBubble message={m} isMe={isMe} />
              <div className="mt-1 flex items-center gap-1">
                {m.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    onClick={() => handleToggleReaction(m.id, r.emoji)}
                    className={`rounded-full px-2 py-0.5 text-xs font-bold [border:1.5px_solid_var(--ink)] ${r.reactedByMe ? "bg-lemon" : "bg-card"}`}
                  >
                    {r.emoji} {r.count}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setReactMessageId(reactMessageId === m.id ? null : m.id)}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-card text-xs [border:1.5px_solid_var(--ink)]"
                  aria-label="React"
                >
                  +
                </button>
              </div>
              {reactMessageId === m.id && (
                <div className="mt-1 flex gap-1 rounded-xl bg-card p-1.5 [border:var(--border-thick)]">
                  {REACTION_EMOJIS.map((e) => (
                    <button key={e} type="button" onClick={() => handleToggleReaction(m.id, e)} className="text-lg leading-none">
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-4 pb-2 text-xs font-bold text-gum">{error}</p>}

      <form onSubmit={handleSendText} className="flex items-center gap-2 border-t-2 border-ink/10 p-3">
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelected} className="hidden" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card [border:var(--border-thick)]"
          aria-label="Send a photo"
        >
          {uploading ? <Spinner size={16} /> : <span className="text-xl" dangerouslySetInnerHTML={{ __html: icon("camera") }} />}
        </button>
        <button
          type="button"
          onClick={() => openGamePicker("share")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card [border:var(--border-thick)]"
          aria-label="Share a game"
        >
          <span className="text-xl" dangerouslySetInnerHTML={{ __html: icon("gamepad") }} />
        </button>
        <button
          type="button"
          onClick={() => openGamePicker("challenge")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card [border:var(--border-thick)]"
          aria-label="Challenge this group"
        >
          <span className="text-xl" dangerouslySetInnerHTML={{ __html: icon("bolt") }} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message..."
          className="min-w-0 flex-1 rounded-xl bg-card p-2.5 text-sm font-bold [border:var(--border-thick)]"
        />
        <button type="submit" disabled={sending || !text.trim()} className="btn go shrink-0">
          {sending ? <Spinner size={16} /> : "Send"}
        </button>
      </form>

      {gamePickerMode && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4"
          onClick={() => setGamePickerMode(null)}
        >
          <div
            className="card-hard max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-paper p-4 [border:var(--border-thick)] [box-shadow:var(--shadow-lg)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-extrabold">{gamePickerMode === "challenge" ? "Challenge This Group" : "Share a Game"}</h3>
            {games === null ? (
              <div className="mt-4 flex justify-center">
                <Spinner size={20} />
              </div>
            ) : games.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-soft">No published games yet.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {games.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => handlePickGame(g)}
                    className="flex items-center gap-3 rounded-xl bg-card p-2.5 text-left [border:var(--border-thick)]"
                  >
                    <div
                      className="h-10 w-10 shrink-0 rounded-lg bg-lemon [border:1.5px_solid_var(--ink)]"
                      style={g.coverImage ? { backgroundImage: `url(${g.coverImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                    />
                    <span className="truncate font-bold text-ink">{g.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, isMe }: { message: CommunityMessageItem; isMe: boolean }) {
  const base = `max-w-[75%] rounded-2xl p-3 text-sm font-semibold [border:var(--border-thick)] ${isMe ? "bg-lemon text-ink" : "bg-card text-ink"}`;

  if (message.messageType === "image") {
    const url = String(message.metadata.imageUrl ?? "");
    return (
      <div className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img src={url} alt="Shared photo" className="max-w-full rounded-xl" />}
        {message.content && <p className="mt-2">{message.content}</p>}
      </div>
    );
  }

  if (message.messageType === "game_share") {
    const slug = String(message.metadata.slug ?? "");
    const title = String(message.metadata.title ?? "a game");
    return (
      <Link href={`/play/${slug}`} className={`${base} block hover:brightness-95`}>
        <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-soft">
          <span dangerouslySetInnerHTML={{ __html: icon("gamepad") }} />
          Shared a game
        </p>
        <p className="mt-1 font-extrabold">{title}</p>
        <p className="mt-1 text-xs font-bold underline">Play now →</p>
      </Link>
    );
  }

  if (message.messageType === "challenge") {
    const code = String(message.metadata.code ?? "");
    const gameTitle = String(message.metadata.gameTitle ?? "a game");
    const score = Number(message.metadata.senderScore ?? 0);
    return (
      <Link href={`/c/${code}`} className={`${base} block hover:brightness-95`}>
        <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-soft">
          <span dangerouslySetInnerHTML={{ __html: icon("bolt") }} />
          Challenge dropped
        </p>
        <p className="mt-1 font-extrabold">
          {gameTitle} — beat {score} pts!
        </p>
        <p className="mt-1 text-xs font-bold underline">Accept challenge →</p>
      </Link>
    );
  }

  return <div className={base}>{message.content}</div>;
}
