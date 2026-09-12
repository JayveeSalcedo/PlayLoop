import { afterEach, describe, expect, it } from "vitest";
import { isAdminEmail } from "./admin";

/**
 * isAdminEmail is the whole admin boundary — there's no role column or second
 * check behind it — so the cases that matter most here are the ones that would
 * let the wrong person in, not the ones that let the right person in.
 */
function setAdmins(value: string | undefined) {
  if (value === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = value;
}

afterEach(() => setAdmins(undefined));

describe("isAdminEmail", () => {
  it("lets nobody in when ADMIN_EMAILS is unset", () => {
    setAdmins(undefined);
    expect(isAdminEmail("anyone@playloop.app")).toBe(false);
  });

  it("lets nobody in when ADMIN_EMAILS is empty or only separators", () => {
    for (const value of ["", "   ", ",", " , , "]) {
      setAdmins(value);
      expect(isAdminEmail("anyone@playloop.app")).toBe(false);
    }
  });

  it("admits an address on the list", () => {
    setAdmins("boss@playloop.app");
    expect(isAdminEmail("boss@playloop.app")).toBe(true);
  });

  it("admits any address on a multi-entry list", () => {
    setAdmins("a@playloop.app,b@playloop.app,c@playloop.app");
    expect(isAdminEmail("b@playloop.app")).toBe(true);
  });

  it("ignores case and surrounding whitespace on both sides", () => {
    setAdmins("  BOSS@Playloop.app , other@playloop.app ");
    expect(isAdminEmail("boss@playloop.APP")).toBe(true);
    expect(isAdminEmail("  boss@playloop.app  ")).toBe(true);
  });

  it("survives empty entries left by a stray comma", () => {
    setAdmins("a@playloop.app,,b@playloop.app,");
    expect(isAdminEmail("b@playloop.app")).toBe(true);
    // The empty entries must not become a wildcard that matches an empty email.
    expect(isAdminEmail("")).toBe(false);
  });

  it("rejects an address that is not on the list", () => {
    setAdmins("boss@playloop.app");
    expect(isAdminEmail("someone@playloop.app")).toBe(false);
  });

  it("matches whole addresses, not substrings of them", () => {
    setAdmins("boss@playloop.app");
    expect(isAdminEmail("notboss@playloop.app")).toBe(false);
    expect(isAdminEmail("boss@playloop.app.evil.com")).toBe(false);
    expect(isAdminEmail("boss")).toBe(false);
  });

  it("rejects a missing email even when the list is populated", () => {
    setAdmins("boss@playloop.app");
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });
});
