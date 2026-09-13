import { INK } from "@playloop/ui";
import QRCode from "qrcode";

/**
 * Renders arbitrary text (a voucher code, a share URL) as a real, scannable
 * QR — an inline `<svg>` string. Replaces the prototype's qrSVG
 * (playloop-prototype.html: 1394), which drew a pseudo-random,
 * non-decodable pattern.
 *
 * Server-only: kept in apps/web (not @playloop/ui, which client-bundled
 * components import) so the `qrcode` package never ships to the browser.
 */
export async function qrSvg(data: string): Promise<string> {
  return QRCode.toString(data, { type: "svg", margin: 1, color: { dark: INK, light: "#ffffff" } });
}

/** A voucher's redemption code, encoded for the staff scanner. */
export async function voucherQrSvg(code: string): Promise<string> {
  return qrSvg(code);
}
