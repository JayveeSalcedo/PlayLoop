import { ImageResponse } from "next/og";
import { iconMark } from "@/app/_components/pwa/iconArt";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(iconMark(180), size);
}
