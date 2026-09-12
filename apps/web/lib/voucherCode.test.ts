import { describe, expect, it } from "vitest";
import { generateVoucherCode, normalizeVoucherCode } from "./voucherCode";

/**
 * The scanner matches a typed code against vouchers.code exactly, so anything
 * normalisation gets wrong shows up at a till as "voucher not found" for a
 * voucher that is perfectly valid.
 */
describe("normalizeVoucherCode", () => {
  it("leaves an already-correct code alone", () => {
    expect(normalizeVoucherCode("BH-4F2A-91")).toBe("BH-4F2A-91");
  });

  it("uppercases", () => {
    expect(normalizeVoucherCode("bh-4f2a-91")).toBe("BH-4F2A-91");
  });

  it("re-inserts missing dashes", () => {
    expect(normalizeVoucherCode("BH4F2A91")).toBe("BH-4F2A-91");
  });

  it("accepts spaces in place of dashes", () => {
    expect(normalizeVoucherCode("bh 4f2a 91")).toBe("BH-4F2A-91");
  });

  it("survives padding, en dashes and stray punctuation", () => {
    expect(normalizeVoucherCode("  BH–4F2A–91  ")).toBe("BH-4F2A-91");
    expect(normalizeVoucherCode("BH_4F2A.91")).toBe("BH-4F2A-91");
    expect(normalizeVoucherCode("BH--4F2A--91")).toBe("BH-4F2A-91");
  });

  it("normalises whatever generateVoucherCode produces to itself", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateVoucherCode("Beanhouse");
      expect(normalizeVoucherCode(code)).toBe(code);
      expect(normalizeVoucherCode(code.toLowerCase().replace(/-/g, " "))).toBe(code);
    }
  });

  it("does not force wrong-length input into a valid-looking code", () => {
    // Too short / too long stays unformatted, so it simply won't match a
    // stored code — better an honest "unknown" than a plausible near-miss.
    expect(normalizeVoucherCode("BH4F2A9")).toBe("BH4F2A9");
    expect(normalizeVoucherCode("BH4F2A911")).toBe("BH4F2A911");
    expect(normalizeVoucherCode("")).toBe("");
    expect(normalizeVoucherCode("!!!")).toBe("");
  });
});
