import { INK } from "@playloop/ui";
import QRCode from "qrcode";

/**
 * Renders a voucher's redemption code as a real, scannable QR — an inline
 * `<svg>` string. Replaces the prototype's qrSVG (playloop-prototype.html:
 * 1394), which drew a pseudo-random, non-decodable pattern. Nothing scans
 * vouchers yet (that's the future staff scanner), but the code should
 * already be genuinely encoded.
 *
 * Server-only: kept in apps/web (not @playloop/ui, which the client-bundled
 * GamePlayer imports) so the `qrcode` package never ships to the browser.
 */
export async function voucherQrSvg(code: string): Promise<string> {
  return QRCode.toString(code, { type: "svg", margin: 1, color: { dark: INK, light: "#ffffff" } });
}
