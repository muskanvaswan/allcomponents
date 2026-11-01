import { ImageResponse } from "next/og";
import { AppMark } from "@/components/app-mark";

// The home screen icon on Apple devices, which round its corners themselves.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppMark size={180} rounded={false} />, size);
}
