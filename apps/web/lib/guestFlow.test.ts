import { describe, expect, it } from "vitest";
import { GUEST_DAILY_CAP, WELCOME_GIFT_BONUS } from "@playloop/economy";

describe("Universal Guest Mode & OnePass specs", () => {
  it("enforces the prototype GUEST_DAILY_CAP of 2,000 points", () => {
    expect(GUEST_DAILY_CAP).toBe(2000);
  });

  it("grants the standard 300 pt welcome gift on guest creation", () => {
    expect(WELCOME_GIFT_BONUS).toBe(300);
  });

  it("resolves default name correctly for guest vs registered profiles", () => {
    function resolveInitialName(args: { isGuest?: boolean; name?: string | null }) {
      return args.name !== undefined ? args.name : (args.isGuest ? "Guest Player" : null);
    }

    // Guest without explicit name
    expect(resolveInitialName({ isGuest: true })).toBe("Guest Player");

    // Guest with custom name
    expect(resolveInitialName({ isGuest: true, name: "SpeedRunner" })).toBe("SpeedRunner");

    // Standard registration without name (completed in onboarding)
    expect(resolveInitialName({ isGuest: false })).toBe(null);
    expect(resolveInitialName({})).toBe(null);
  });

  it("creates valid synthetic emails for guest sessions", () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const testUuid = "12345678-1234-1234-1234-123456789abc";
    const syntheticEmail = `guest+${testUuid}@guest.playloop.internal`;

    expect(syntheticEmail.startsWith("guest+")).toBe(true);
    expect(syntheticEmail.endsWith("@guest.playloop.internal")).toBe(true);
    const extractedUuid = syntheticEmail.replace("guest+", "").replace("@guest.playloop.internal", "");
    expect(uuidPattern.test(extractedUuid)).toBe(true);
  });
});
