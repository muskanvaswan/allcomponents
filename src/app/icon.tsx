import { ImageResponse } from "next/og";
import { AppMark } from "@/components/app-mark";

// The browser tab's icon.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<AppMark size={32} />, size);
}
