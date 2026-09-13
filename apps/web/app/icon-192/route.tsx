import { ImageResponse } from "next/og";
import { iconMark } from "@/app/_components/pwa/iconArt";

/** Served at /icon-192 — referenced by manifest.ts's icons array. */
export function GET() {
  return new ImageResponse(iconMark(192), { width: 192, height: 192 });
}
