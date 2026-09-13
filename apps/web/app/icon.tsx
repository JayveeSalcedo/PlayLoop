import { ImageResponse } from "next/og";
import { iconMark } from "@/app/_components/pwa/iconArt";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(iconMark(32), size);
}
