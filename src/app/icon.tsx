import { ImageResponse } from "next/og";
import { AppMark } from "@/components/app-mark";

// The site's icon, in each size it's asked for: browser tabs, search results (which want a multiple of 48px), and
// home screens and installs (192 and 512, which src/app/manifest.ts lists). Each is served at /icon/<size>.
const SIZES = [48, 96, 192, 512];

export function generateImageMetadata() {
  return SIZES.map((s) => ({ id: String(s), size: { width: s, height: s }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const s = Number(await id);
  return new ImageResponse(<AppMark size={s} />, { width: s, height: s });
}
