import { ImageResponse } from "next/og";
import { iconMark } from "@/app/_components/pwa/iconArt";

/** Served at /icon-512 — referenced by manifest.ts's icons array (also its maskable entry). */
export function GET() {
  return new ImageResponse(iconMark(512), { width: 512, height: 512 });
}
