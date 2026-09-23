import { getDb, schema } from "@playloop/db";
import { and, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { createChallenge } from "../app/play/[slug]/challengeActions";

export type Community = typeof schema.communities.$inferSelect;
export type CommunityMessage = typeof schema.communityMessages.$inferSelect;

const MAX_MEMBERS = 50;
const MAX_MESSAGE_LENGTH = 2000;

export function generateInviteCode(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}

async function requireAdmin(db: ReturnType<typeof getDb>, communityId: string, profileId: string) {
  const member = await db
    .select()
    .from(schema.communityMembers)
    .where(and(eq(schema.communityMembers.communityId, communityId), eq(schema.communityMembers.profileId, profileId)))
    .then((r) => r[0]);
  if (!member || member.role !== "admin") throw new Error("Only a group admin can do that.");
  return member;
}

async function memberCountFor(db: ReturnType<typeof getDb>, communityId: string): Promise<number> {
  return db
    .select({ n: count() })
    .from(schema.communityMembers)
    .where(eq(schema.communityMembers.communityId, communityId))
    .then((r) => r[0]?.n ?? 0);
}

export interface CommunityListItem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isPublic: boolean;
  requiresApproval: boolean;
  inviteCode: string;
  memberCount: number;
  role: string | null;
}

/**
 * Creates a brand-new community and joins the creator as admin. Mirrors
 * createCustomLeague's retry-once-on-code-collision defensiveness.
 */
export async function createCommunity(
  profileId: string,
  args: { name: string; description?: string; imageUrl?: string; isPublic: boolean; requiresApproval?: boolean },
): Promise<{ ok: boolean; error?: string; community?: Community }> {
  const name = args.name.trim();
  if (!name) return { ok: false, error: "Give your group a name." };

  const isPublic = args.isPublic;
  // requiresApproval only means anything for a public group — a private
  // group is invite-code-only, and possession of the code is the invitation.
  const requiresApproval = isPublic ? !!args.requiresApproval : false;

  const db = getDb();

  for (let attempt = 0; attempt < 2; attempt++) {
    const inviteCode = generateInviteCode();
    try {
      const [community] = await db
        .insert(schema.communities)
        .values({
          name,
          description: args.description?.trim() || null,
          imageUrl: args.imageUrl || null,
          isPublic,
          requiresApproval,
          inviteCode,
          creatorId: profileId,
        })
        .returning();

      await db.insert(schema.communityMembers).values({
        communityId: community!.id,
        profileId,
        role: "admin",
      });

      return { ok: true, community: community! };
    } catch (err: any) {
      if (err?.code === "23505" && attempt === 0) continue;
      if (err?.code === "23505") return { ok: false, error: "Could not generate a unique invite code. Try again." };
      return { ok: false, error: "Could not create the group. Please try again." };
    }
  }
  return { ok: false, error: "Could not create the group. Please try again." };
}

/**
 * Private-group join path: possession of the code is the invitation, so
 * this is always instant — never gated by requiresApproval.
 */
export async function joinCommunityByCode(
  profileId: string,
  rawCode: string,
): Promise<{ ok: boolean; error?: string; community?: Community }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a valid invite code." };

  const db = getDb();
  const community = await db
    .select()
    .from(schema.communities)
    .where(eq(schema.communities.inviteCode, code))
    .then((r) => r[0]);
  if (!community) return { ok: false, error: "Code not recognised. Check it with whoever invited you." };

  const existing = await db
    .select()
    .from(schema.communityMembers)
    .where(and(eq(schema.communityMembers.communityId, community.id), eq(schema.communityMembers.profileId, profileId)))
    .then((r) => r[0]);
  if (existing) return { ok: true, community };

  if ((await memberCountFor(db, community.id)) >= MAX_MEMBERS) {
    return { ok: false, error: "This group is full." };
  }

  await db
    .insert(schema.communityMembers)
    .values({ communityId: community.id, profileId, role: "member" })
    .onConflictDoNothing();

  return { ok: true, community };
}

/**
 * Public-group join path. Instant-joins unless the group's creator turned
 * on requiresApproval, in which case this files a join request instead —
 * re-requesting after a rejection just flips the same row back to pending.
 */
export async function requestToJoinCommunity(
  profileId: string,
  communityId: string,
): Promise<{ ok: boolean; error?: string; status?: "joined" | "pending" }> {
  const db = getDb();
  const community = await db.select().from(schema.communities).where(eq(schema.communities.id, communityId)).then((r) => r[0]);
  if (!community || !community.isPublic) return { ok: false, error: "Group not found." };

  const existingMember = await db
    .select()
    .from(schema.communityMembers)
    .where(and(eq(schema.communityMembers.communityId, communityId), eq(schema.communityMembers.profileId, profileId)))
    .then((r) => r[0]);
  if (existingMember) return { ok: true, status: "joined" };

  if (!community.requiresApproval) {
    if ((await memberCountFor(db, communityId)) >= MAX_MEMBERS) {
      return { ok: false, error: "This group is full." };
    }
    await db.insert(schema.communityMembers).values({ communityId, profileId, role: "member" }).onConflictDoNothing();
    return { ok: true, status: "joined" };
  }

  await db
    .insert(schema.communityJoinRequests)
    .values({ communityId, profileId, status: "pending" })
    .onConflictDoUpdate({
      target: [schema.communityJoinRequests.communityId, schema.communityJoinRequests.profileId],
      set: { status: "pending", createdAt: sql`now()`, decidedAt: null, decidedBy: null },
    });

  return { ok: true, status: "pending" };
}

export interface JoinRequestItem {
  id: string;
  profileId: string;
  name: string | null;
  avatarIndex: number;
  createdAt: Date;
}

export async function listJoinRequests(actorProfileId: string, communityId: string): Promise<JoinRequestItem[]> {
  const db = getDb();
  await requireAdmin(db, communityId, actorProfileId);

  return db
    .select({
      id: schema.communityJoinRequests.id,
      profileId: schema.communityJoinRequests.profileId,
      name: schema.profiles.name,
      avatarIndex: schema.profiles.avatarIndex,
      createdAt: schema.communityJoinRequests.createdAt,
    })
    .from(schema.communityJoinRequests)
    .innerJoin(schema.profiles, eq(schema.communityJoinRequests.profileId, schema.profiles.id))
    .where(and(eq(schema.communityJoinRequests.communityId, communityId), eq(schema.communityJoinRequests.status, "pending")))
    .orderBy(schema.communityJoinRequests.createdAt);
}

export async function approveJoinRequest(
  actorProfileId: string,
  communityId: string,
  requestId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  await requireAdmin(db, communityId, actorProfileId);

  const request = await db
    .select()
    .from(schema.communityJoinRequests)
    .where(and(eq(schema.communityJoinRequests.id, requestId), eq(schema.communityJoinRequests.communityId, communityId)))
    .then((r) => r[0]);
  if (!request || request.status !== "pending") return { ok: false, error: "That request is no longer pending." };

  if ((await memberCountFor(db, communityId)) >= MAX_MEMBERS) {
    return { ok: false, error: "This group is full." };
  }

  await db
    .insert(schema.communityMembers)
    .values({ communityId, profileId: request.profileId, role: "member" })
    .onConflictDoNothing();
  await db
    .update(schema.communityJoinRequests)
    .set({ status: "approved", decidedAt: sql`now()`, decidedBy: actorProfileId })
    .where(eq(schema.communityJoinRequests.id, requestId));

  return { ok: true };
}

export async function rejectJoinRequest(
  actorProfileId: string,
  communityId: string,
  requestId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  await requireAdmin(db, communityId, actorProfileId);

  await db
    .update(schema.communityJoinRequests)
    .set({ status: "rejected", decidedAt: sql`now()`, decidedBy: actorProfileId })
    .where(and(eq(schema.communityJoinRequests.id, requestId), eq(schema.communityJoinRequests.communityId, communityId)));

  return { ok: true };
}

/**
 * If the leaver is the sole admin with other members remaining, the
 * earliest-joined remaining member is auto-promoted so the group is never
 * left without an admin. If they're the last member of any role, the whole
 * group is deleted (cascades clean up messages/reactions/requests).
 */
export async function leaveCommunity(profileId: string, communityId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const member = await db
    .select()
    .from(schema.communityMembers)
    .where(and(eq(schema.communityMembers.communityId, communityId), eq(schema.communityMembers.profileId, profileId)))
    .then((r) => r[0]);
  if (!member) return { ok: false, error: "You're not in this group." };

  const allMembers = await db
    .select()
    .from(schema.communityMembers)
    .where(eq(schema.communityMembers.communityId, communityId))
    .orderBy(schema.communityMembers.joinedAt);
  const remaining = allMembers.filter((m) => m.profileId !== profileId);

  if (remaining.length === 0) {
    await db.delete(schema.communities).where(eq(schema.communities.id, communityId));
    return { ok: true };
  }

  await db.delete(schema.communityMembers).where(eq(schema.communityMembers.id, member.id));

  if (!remaining.some((m) => m.role === "admin")) {
    const successor = remaining[0]!;
    await db.update(schema.communityMembers).set({ role: "admin" }).where(eq(schema.communityMembers.id, successor.id));
  }

  return { ok: true };
}

/** Flat admin hierarchy: any admin can act on any member, including another admin. */
export async function promoteMember(actorProfileId: string, communityId: string, targetProfileId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  await requireAdmin(db, communityId, actorProfileId);
  await db
    .update(schema.communityMembers)
    .set({ role: "admin" })
    .where(and(eq(schema.communityMembers.communityId, communityId), eq(schema.communityMembers.profileId, targetProfileId)));
  return { ok: true };
}

export async function demoteMember(actorProfileId: string, communityId: string, targetProfileId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  await requireAdmin(db, communityId, actorProfileId);
  await db
    .update(schema.communityMembers)
    .set({ role: "member" })
    .where(and(eq(schema.communityMembers.communityId, communityId), eq(schema.communityMembers.profileId, targetProfileId)));
  return { ok: true };
}

export async function removeMember(actorProfileId: string, communityId: string, targetProfileId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  await requireAdmin(db, communityId, actorProfileId);
  await db
    .delete(schema.communityMembers)
    .where(and(eq(schema.communityMembers.communityId, communityId), eq(schema.communityMembers.profileId, targetProfileId)));
  return { ok: true };
}

export async function deleteCommunity(actorProfileId: string, communityId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  await requireAdmin(db, communityId, actorProfileId);
  await db.delete(schema.communities).where(eq(schema.communities.id, communityId));
  return { ok: true };
}

export async function updateCommunity(
  actorProfileId: string,
  communityId: string,
  args: { name?: string; description?: string; imageUrl?: string; isPublic?: boolean; requiresApproval?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  await requireAdmin(db, communityId, actorProfileId);

  const updates: Partial<typeof schema.communities.$inferInsert> = {};
  if (args.name !== undefined) updates.name = args.name.trim();
  if (args.description !== undefined) updates.description = args.description.trim() || null;
  if (args.imageUrl !== undefined) updates.imageUrl = args.imageUrl || null;
  if (args.isPublic !== undefined) updates.isPublic = args.isPublic;
  if (args.requiresApproval !== undefined) {
    updates.requiresApproval = args.isPublic === false ? false : args.requiresApproval;
  }

  if (Object.keys(updates).length === 0) return { ok: true };
  await db.update(schema.communities).set(updates).where(eq(schema.communities.id, communityId));
  return { ok: true };
}

/** Returns the inserted row for optimistic append, deduped client-side against the Realtime echo by id. */
export async function sendMessage(
  profileId: string,
  communityId: string,
  args: { content?: string; messageType?: "text" | "image" | "game_share" | "challenge"; metadata?: Record<string, unknown> },
): Promise<{ ok: boolean; error?: string; message?: CommunityMessage }> {
  const db = getDb();
  const member = await db
    .select()
    .from(schema.communityMembers)
    .where(and(eq(schema.communityMembers.communityId, communityId), eq(schema.communityMembers.profileId, profileId)))
    .then((r) => r[0]);
  if (!member) return { ok: false, error: "You're not in this group." };

  const messageType = args.messageType ?? "text";
  const content = (args.content ?? "").trim().slice(0, MAX_MESSAGE_LENGTH);
  const metadata = args.metadata ?? {};

  if (messageType === "text" && !content) return { ok: false, error: "Message can't be empty." };
  if (messageType === "image" && !metadata.imageUrl) return { ok: false, error: "Missing image." };

  const [message] = await db
    .insert(schema.communityMessages)
    .values({ communityId, senderId: profileId, content, messageType, metadata })
    .returning();

  return { ok: true, message: message! };
}

/** Snapshots the game's current title/cover into the message — a link card to /play/[slug], not a live join. */
export async function shareGameInChat(
  profileId: string,
  communityId: string,
  gameId: string,
): Promise<{ ok: boolean; error?: string; message?: CommunityMessage }> {
  const db = getDb();
  const game = await db
    .select()
    .from(schema.games)
    .where(and(eq(schema.games.id, gameId), eq(schema.games.status, "published")))
    .then((r) => r[0]);
  if (!game) return { ok: false, error: "Game not found." };

  return sendMessage(profileId, communityId, {
    messageType: "game_share",
    metadata: { gameId: game.id, slug: game.slug, title: game.title, coverImage: game.coverImage },
  });
}

/** Posts an already-existing challenge code as a chat message — no new challenge row created. */
export async function postChallengeCodeToChat(
  profileId: string,
  communityId: string,
  args: { code: string; gameTitle: string; senderScore: number },
): Promise<{ ok: boolean; error?: string; message?: CommunityMessage }> {
  return sendMessage(profileId, communityId, {
    messageType: "challenge",
    metadata: { code: args.code, gameTitle: args.gameTitle, senderScore: args.senderScore },
  });
}

/**
 * Calls the existing createChallenge(sessionId) — never a parallel
 * challenge system — then posts the resulting code as a chat message. Used
 * by the in-chat "Challenge this group" flow, where no challenge exists
 * yet. The post-play ChallengeShare screen instead reuses an
 * already-created code via postChallengeCodeToChat, to avoid minting a
 * second challenge row for the same play session.
 */
export async function postChallengeToChat(
  profileId: string,
  communityId: string,
  sessionId: string,
): Promise<{ ok: boolean; error?: string; message?: CommunityMessage }> {
  const { code } = await createChallenge(sessionId);

  const db = getDb();
  const playSession = await db
    .select({ score: schema.playSessions.score, gameId: schema.playSessions.gameId })
    .from(schema.playSessions)
    .where(eq(schema.playSessions.id, sessionId))
    .then((r) => r[0]);
  const game = playSession
    ? await db.select({ title: schema.games.title }).from(schema.games).where(eq(schema.games.id, playSession.gameId)).then((r) => r[0])
    : undefined;

  return postChallengeCodeToChat(profileId, communityId, {
    code,
    gameTitle: game?.title ?? "a game",
    senderScore: playSession?.score ?? 0,
  });
}

/** Tap-to-toggle: re-reacting with the same emoji removes it. */
export async function toggleReaction(profileId: string, messageId: string, emoji: string): Promise<{ ok: boolean; error?: string; active: boolean }> {
  const db = getDb();
  const message = await db
    .select({ communityId: schema.communityMessages.communityId })
    .from(schema.communityMessages)
    .where(eq(schema.communityMessages.id, messageId))
    .then((r) => r[0]);
  if (!message) return { ok: false, error: "Message not found.", active: false };

  const member = await db
    .select()
    .from(schema.communityMembers)
    .where(and(eq(schema.communityMembers.communityId, message.communityId), eq(schema.communityMembers.profileId, profileId)))
    .then((r) => r[0]);
  if (!member) return { ok: false, error: "You're not in this group.", active: false };

  const existing = await db
    .select()
    .from(schema.communityReactions)
    .where(
      and(
        eq(schema.communityReactions.messageId, messageId),
        eq(schema.communityReactions.profileId, profileId),
        eq(schema.communityReactions.emoji, emoji),
      ),
    )
    .then((r) => r[0]);

  if (existing) {
    await db.delete(schema.communityReactions).where(eq(schema.communityReactions.id, existing.id));
    return { ok: true, active: false };
  }

  await db.insert(schema.communityReactions).values({ messageId, profileId, emoji });
  return { ok: true, active: true };
}

function attachCounts(
  db: ReturnType<typeof getDb>,
  rows: Community[],
  profileId: string,
  roleByCommunityId?: Map<string, string>,
): Promise<CommunityListItem[]> {
  if (rows.length === 0) return Promise.resolve([]);
  const ids = rows.map((r) => r.id);

  return Promise.all([
    db
      .select({ communityId: schema.communityMembers.communityId, n: count() })
      .from(schema.communityMembers)
      .where(inArray(schema.communityMembers.communityId, ids))
      .groupBy(schema.communityMembers.communityId),
    roleByCommunityId
      ? Promise.resolve(null)
      : db
          .select({ communityId: schema.communityMembers.communityId, role: schema.communityMembers.role })
          .from(schema.communityMembers)
          .where(and(inArray(schema.communityMembers.communityId, ids), eq(schema.communityMembers.profileId, profileId))),
  ]).then(([counts, myMemberships]) => {
    const countById = new Map(counts.map((c) => [c.communityId, c.n]));
    const roleById = roleByCommunityId ?? new Map((myMemberships ?? []).map((m) => [m.communityId, m.role]));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      imageUrl: r.imageUrl,
      isPublic: r.isPublic,
      requiresApproval: r.requiresApproval,
      inviteCode: r.inviteCode,
      memberCount: countById.get(r.id) ?? 0,
      role: roleById.get(r.id) ?? null,
    }));
  });
}

export async function listPublicCommunities(profileId: string, query?: string): Promise<CommunityListItem[]> {
  const db = getDb();
  const trimmed = query?.trim();
  const rows = await db
    .select()
    .from(schema.communities)
    .where(trimmed ? and(eq(schema.communities.isPublic, true), ilike(schema.communities.name, `%${trimmed}%`)) : eq(schema.communities.isPublic, true))
    .orderBy(desc(schema.communities.createdAt))
    .limit(50);

  return attachCounts(db, rows, profileId);
}

export async function getCommunitiesForProfile(profileId: string): Promise<CommunityListItem[]> {
  const db = getDb();
  const memberships = await db
    .select({ communityId: schema.communityMembers.communityId, role: schema.communityMembers.role })
    .from(schema.communityMembers)
    .where(eq(schema.communityMembers.profileId, profileId));
  if (memberships.length === 0) return [];

  const ids = memberships.map((m) => m.communityId);
  const roleById = new Map(memberships.map((m) => [m.communityId, m.role]));
  const rows = await db.select().from(schema.communities).where(inArray(schema.communities.id, ids));

  return attachCounts(db, rows, profileId, roleById);
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface CommunityMessageItem {
  id: string;
  communityId: string;
  senderId: string;
  senderName: string | null;
  senderAvatarIndex: number;
  content: string;
  messageType: "text" | "image" | "game_share" | "challenge";
  metadata: Record<string, unknown>;
  createdAt: Date;
  reactions: ReactionSummary[];
}

export async function getCommunityMessages(
  communityId: string,
  opts?: { before?: Date; limit?: number; viewerProfileId?: string },
): Promise<CommunityMessageItem[]> {
  const db = getDb();
  const limit = opts?.limit ?? 30;

  const rows = await db
    .select({
      id: schema.communityMessages.id,
      communityId: schema.communityMessages.communityId,
      senderId: schema.communityMessages.senderId,
      senderName: schema.profiles.name,
      senderAvatarIndex: schema.profiles.avatarIndex,
      content: schema.communityMessages.content,
      messageType: schema.communityMessages.messageType,
      metadata: schema.communityMessages.metadata,
      createdAt: schema.communityMessages.createdAt,
    })
    .from(schema.communityMessages)
    .innerJoin(schema.profiles, eq(schema.communityMessages.senderId, schema.profiles.id))
    .where(
      opts?.before
        ? and(eq(schema.communityMessages.communityId, communityId), sql`${schema.communityMessages.createdAt} < ${opts.before}`)
        : eq(schema.communityMessages.communityId, communityId),
    )
    .orderBy(desc(schema.communityMessages.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const messageIds = rows.map((r) => r.id);
  const reactionRows = await db
    .select({ messageId: schema.communityReactions.messageId, emoji: schema.communityReactions.emoji, profileId: schema.communityReactions.profileId })
    .from(schema.communityReactions)
    .where(inArray(schema.communityReactions.messageId, messageIds));

  const reactionsByMessage = new Map<string, ReactionSummary[]>();
  for (const r of reactionRows) {
    const list = reactionsByMessage.get(r.messageId) ?? [];
    const existing = list.find((x) => x.emoji === r.emoji);
    if (existing) {
      existing.count++;
      if (r.profileId === opts?.viewerProfileId) existing.reactedByMe = true;
    } else {
      list.push({ emoji: r.emoji, count: 1, reactedByMe: r.profileId === opts?.viewerProfileId });
    }
    reactionsByMessage.set(r.messageId, list);
  }

  return rows.reverse().map((r) => ({ ...r, reactions: reactionsByMessage.get(r.id) ?? [] }));
}

export interface PublishedGameItem {
  id: string;
  slug: string;
  title: string;
  coverImage: string | null;
}

/** Games list for the "Share a game" / "Challenge this group" pickers. */
export async function listPublishedGamesForPicker(): Promise<PublishedGameItem[]> {
  const db = getDb();
  return db
    .select({ id: schema.games.id, slug: schema.games.slug, title: schema.games.title, coverImage: schema.games.coverImage })
    .from(schema.games)
    .where(eq(schema.games.status, "published"))
    .orderBy(desc(schema.games.createdAt))
    .limit(50);
}

export interface CommunityMemberItem {
  profileId: string;
  name: string | null;
  avatarIndex: number;
  role: string;
  joinedAt: Date;
}

export async function getCommunityInfo(communityId: string): Promise<{ community: Community; members: CommunityMemberItem[] } | null> {
  const db = getDb();
  const community = await db.select().from(schema.communities).where(eq(schema.communities.id, communityId)).then((r) => r[0]);
  if (!community) return null;

  const members = await db
    .select({
      profileId: schema.communityMembers.profileId,
      name: schema.profiles.name,
      avatarIndex: schema.profiles.avatarIndex,
      role: schema.communityMembers.role,
      joinedAt: schema.communityMembers.joinedAt,
    })
    .from(schema.communityMembers)
    .innerJoin(schema.profiles, eq(schema.communityMembers.profileId, schema.profiles.id))
    .where(eq(schema.communityMembers.communityId, communityId))
    .orderBy(schema.communityMembers.joinedAt);

  return { community, members };
}

export interface CommunityLeaderboardEntry {
  profileId: string;
  weeklyPoints: number;
}

/** Same query shape as friends.ts's getWeeklyLeaderboard, scoped to this group's members instead of friends. */
export async function getCommunityWeeklyLeaderboard(communityId: string): Promise<CommunityLeaderboardEntry[]> {
  const db = getDb();
  const members = await db
    .select({ profileId: schema.communityMembers.profileId })
    .from(schema.communityMembers)
    .where(eq(schema.communityMembers.communityId, communityId));
  if (members.length === 0) return [];

  const allIds = members.map((m) => m.profileId);

  return db
    .select({
      profileId: schema.ledgerEntries.profileId,
      weeklyPoints: sql<number>`coalesce(sum(${schema.ledgerEntries.delta}), 0)`.as("weekly_points"),
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        inArray(schema.ledgerEntries.profileId, allIds),
        sql`${schema.ledgerEntries.delta} > 0`,
        sql`${schema.ledgerEntries.createdAt} >= date_trunc('week', current_date)`,
      ),
    )
    .groupBy(schema.ledgerEntries.profileId)
    .orderBy(sql`weekly_points DESC`);
}
