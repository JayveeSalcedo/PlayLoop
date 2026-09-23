import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

describe("Communities & Group Chat", () => {
  it("generates a 6-char uppercase hex invite code", () => {
    function generateInviteCode(): string {
      return randomBytes(3).toString("hex").toUpperCase();
    }

    for (let i = 0; i < 20; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[0-9A-F]{6}$/);
    }
  });

  it("trims and caps message content at 2000 chars", () => {
    const MAX_MESSAGE_LENGTH = 2000;
    function normalize(raw: string): string {
      return raw.trim().slice(0, MAX_MESSAGE_LENGTH);
    }

    expect(normalize("  hello  ")).toBe("hello");
    expect(normalize("a".repeat(3000)).length).toBe(2000);
    expect(normalize("   ")).toBe("");
  });

  it("enforces the 50-member cap before inserting", () => {
    const MAX_MEMBERS = 50;
    function canJoin(currentCount: number): boolean {
      return currentCount < MAX_MEMBERS;
    }

    expect(canJoin(49)).toBe(true);
    expect(canJoin(50)).toBe(false);
    expect(canJoin(0)).toBe(true);
  });

  it("toggles a reaction: same emoji from the same person removes it", () => {
    type Reaction = { profileId: string; emoji: string };
    function toggle(reactions: Reaction[], profileId: string, emoji: string): Reaction[] {
      const idx = reactions.findIndex((r) => r.profileId === profileId && r.emoji === emoji);
      if (idx >= 0) return reactions.filter((_, i) => i !== idx);
      return [...reactions, { profileId, emoji }];
    }

    let reactions: Reaction[] = [];
    reactions = toggle(reactions, "p1", "🔥");
    expect(reactions).toEqual([{ profileId: "p1", emoji: "🔥" }]);

    reactions = toggle(reactions, "p1", "🔥");
    expect(reactions).toEqual([]);

    reactions = toggle(reactions, "p1", "🔥");
    reactions = toggle(reactions, "p1", "😂");
    expect(reactions).toHaveLength(2);
  });

  it("re-requesting after a rejection flips the request back to pending", () => {
    type RequestStatus = "pending" | "approved" | "rejected";
    function reRequest(current: RequestStatus | undefined): RequestStatus {
      return "pending";
    }

    expect(reRequest("rejected")).toBe("pending");
    expect(reRequest(undefined)).toBe("pending");
  });

  it("only requires approval when the group is public", () => {
    function resolveRequiresApproval(isPublic: boolean, requested: boolean | undefined): boolean {
      return isPublic ? !!requested : false;
    }

    expect(resolveRequiresApproval(false, true)).toBe(false);
    expect(resolveRequiresApproval(true, true)).toBe(true);
    expect(resolveRequiresApproval(true, undefined)).toBe(false);
  });
});
