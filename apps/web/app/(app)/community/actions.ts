"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/profile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  approveJoinRequest,
  createCommunity,
  deleteCommunity,
  demoteMember,
  getCommunitiesForProfile,
  getCommunityMessages,
  joinCommunityByCode,
  leaveCommunity,
  listJoinRequests,
  listPublishedGamesForPicker,
  postChallengeCodeToChat,
  postChallengeToChat,
  promoteMember,
  rejectJoinRequest,
  removeMember,
  requestToJoinCommunity,
  sendMessage,
  shareGameInChat,
  toggleReaction,
  updateCommunity,
} from "@/lib/communities";

export async function createCommunityAction(args: {
  name: string;
  description?: string;
  imageUrl?: string;
  isPublic: boolean;
  requiresApproval?: boolean;
}) {
  const { profile } = await requireProfile();
  const result = await createCommunity(profile.id, args);
  if (result.ok) revalidatePath("/community");
  return result;
}

export async function joinCommunityByCodeAction(code: string) {
  const { profile } = await requireProfile();
  const result = await joinCommunityByCode(profile.id, code);
  if (result.ok) revalidatePath("/community");
  return result;
}

export async function requestToJoinCommunityAction(communityId: string) {
  const { profile } = await requireProfile();
  const result = await requestToJoinCommunity(profile.id, communityId);
  if (result.ok) revalidatePath("/community");
  return result;
}

export async function leaveCommunityAction(communityId: string) {
  const { profile } = await requireProfile();
  const result = await leaveCommunity(profile.id, communityId);
  if (result.ok) revalidatePath("/community");
  return result;
}

export async function updateCommunityAction(
  communityId: string,
  args: { name?: string; description?: string; imageUrl?: string; isPublic?: boolean; requiresApproval?: boolean },
) {
  const { profile } = await requireProfile();
  const result = await updateCommunity(profile.id, communityId, args);
  if (result.ok) revalidatePath(`/community/${communityId}`);
  return result;
}

export async function deleteCommunityAction(communityId: string) {
  const { profile } = await requireProfile();
  const result = await deleteCommunity(profile.id, communityId);
  if (result.ok) revalidatePath("/community");
  return result;
}

export async function promoteMemberAction(communityId: string, targetProfileId: string) {
  const { profile } = await requireProfile();
  const result = await promoteMember(profile.id, communityId, targetProfileId);
  if (result.ok) revalidatePath(`/community/${communityId}/info`);
  return result;
}

export async function demoteMemberAction(communityId: string, targetProfileId: string) {
  const { profile } = await requireProfile();
  const result = await demoteMember(profile.id, communityId, targetProfileId);
  if (result.ok) revalidatePath(`/community/${communityId}/info`);
  return result;
}

export async function removeMemberAction(communityId: string, targetProfileId: string) {
  const { profile } = await requireProfile();
  const result = await removeMember(profile.id, communityId, targetProfileId);
  if (result.ok) revalidatePath(`/community/${communityId}/info`);
  return result;
}

export async function listJoinRequestsAction(communityId: string) {
  const { profile } = await requireProfile();
  return listJoinRequests(profile.id, communityId);
}

export async function approveJoinRequestAction(communityId: string, requestId: string) {
  const { profile } = await requireProfile();
  const result = await approveJoinRequest(profile.id, communityId, requestId);
  if (result.ok) revalidatePath(`/community/${communityId}/info`);
  return result;
}

export async function rejectJoinRequestAction(communityId: string, requestId: string) {
  const { profile } = await requireProfile();
  const result = await rejectJoinRequest(profile.id, communityId, requestId);
  if (result.ok) revalidatePath(`/community/${communityId}/info`);
  return result;
}

export async function sendMessageAction(
  communityId: string,
  args: { content?: string; messageType?: "text" | "image" | "game_share" | "challenge"; metadata?: Record<string, unknown> },
) {
  const { profile } = await requireProfile();
  return sendMessage(profile.id, communityId, args);
}

export async function shareGameInChatAction(communityId: string, gameId: string) {
  const { profile } = await requireProfile();
  return shareGameInChat(profile.id, communityId, gameId);
}

export async function postChallengeToChatAction(communityId: string, sessionId: string) {
  const { profile } = await requireProfile();
  return postChallengeToChat(profile.id, communityId, sessionId);
}

export async function postChallengeCodeToChatAction(communityId: string, code: string, gameTitle: string, senderScore: number) {
  const { profile } = await requireProfile();
  return postChallengeCodeToChat(profile.id, communityId, { code, gameTitle, senderScore });
}

export async function getMyCommunitiesAction() {
  const { profile } = await requireProfile();
  return getCommunitiesForProfile(profile.id);
}

export async function toggleReactionAction(messageId: string, emoji: string) {
  const { profile } = await requireProfile();
  return toggleReaction(profile.id, messageId, emoji);
}

export async function getOlderMessagesAction(communityId: string, beforeIso: string) {
  const { profile } = await requireProfile();
  return getCommunityMessages(communityId, { before: new Date(beforeIso), limit: 30, viewerProfileId: profile.id });
}

export async function listPublishedGamesAction() {
  await requireProfile();
  return listPublishedGamesForPicker();
}

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Uploads a client-downscaled image Blob to the community-media bucket, returns its public URL. */
export async function uploadCommunityImageAction(formData: FormData): Promise<{ ok: boolean; error?: string; url?: string }> {
  const { profile } = await requireProfile();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Image is too large." };
  if (!ALLOWED_TYPES.includes(file.type)) return { ok: false, error: "Unsupported image type." };

  const admin = getSupabaseAdminClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${profile.id}/${randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("community-media").upload(path, await file.arrayBuffer(), {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { ok: false, error: "Upload failed. Try again." };

  const { data } = admin.storage.from("community-media").getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
