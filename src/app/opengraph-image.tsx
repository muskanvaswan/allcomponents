import { ImageResponse } from "next/og";
import { AppMark } from "@/components/app-mark";
import { listLibraries, totals } from "@/lib/db";
import { SITE_NAME, SITE_TITLE } from "@/lib/site";

// The picture shown when a link to the site is shared: the name, what it is and
// what's in it, on the site's paper grey. Built once per deploy.
export const alt = SITE_TITLE;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const names = listLibraries()
    .filter((l) => l.status === "ready")
    .map((l) => l.name);
  const from = names.length <= 4 ? new Intl.ListFormat("en").format(names) : `${names.length} libraries`;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "#f5f5f7",
        color: "#1d1d1f",
      }}
    >
      <AppMark size={88} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 124, letterSpacing: -5, lineHeight: 1 }}>{SITE_NAME}</div>
        <div style={{ marginTop: 22, fontSize: 46, color: "#6e6e73" }}>A UI component aggregator</div>
        <div style={{ marginTop: 36, fontSize: 30, color: "#6e6e73" }}>{`${totals().components} components from ${from}, with live previews.`}</div>
      </div>
    </div>,
    size,
  );
}
