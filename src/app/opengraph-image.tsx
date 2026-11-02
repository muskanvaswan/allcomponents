import { ImageResponse } from "next/og";
import { AppMark } from "@/components/app-mark";
import { libraryColorHex } from "@/components/library-mark";
import { listLibraries, totals } from "@/lib/db";
import { SITE_NAME } from "@/lib/site";

// The picture shown when a link to the site is shared, in the site's dark mode: the home page's "All Components"
// heading in its own type on the dotted black page, what the site is, and a chip for each library in it. Built once
// per deploy.
export const alt = `${SITE_NAME}: an aggregator of UI components from many libraries, with live previews`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Dark mode's colours (src/app/globals.css).
const PAPER = "#000000";
const INK = "#f5f5f7";
const MUTED = "#98989d";
const CHIP = "#1c1c1f";
const DOT = "rgba(214, 230, 255, 0.24)";

// The page's margin, and the dot grid's spacing: a dot falls every 40px from the corner, so the margin lands on one.
const MARGIN = 80;
const GRID = 40;

// The renderer can't line text up by its baseline, so the two fonts' boxes sit top to top and "All" is moved down
// until its baseline meets that of "Components" (measured from the rendered image). Its italic foot also leans past
// the margin, so it's nudged in to line up with the logo and the text below.
const ALL_DROP = 6;
const ALL_INSET = 8;

// The most chips that fit on one line; any further libraries are counted in a last chip.
const MAX_CHIPS = 6;

/**
 * A font from Google Fonts as base64 TrueType, cut down to the characters drawn. Next's font loader only keeps web
 * formats the image renderer can't read. Cached, so it's fetched once per deploy; null if Google can't be reached,
 * and the image then falls back to the renderer's own face rather than failing the build.
 */
async function googleFont(family: string, text: string): Promise<string | null> {
  "use cache";
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? Buffer.from(await res.arrayBuffer()).toString("base64") : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const ready = listLibraries().filter((l) => l.status === "ready");
  const shown = ready.slice(0, ready.length > MAX_CHIPS ? MAX_CHIPS - 1 : MAX_CHIPS);
  const more = ready.length - shown.length;
  const chips = [...shown.map((l) => ({ name: l.name, color: libraryColorHex(l.id) })), ...(more ? [{ name: `${more} more`, color: null }] : [])];
  const { components, libraries } = totals();
  // Non-breaking spaces keep each number with its noun when the line wraps.
  const line = `An aggregator of UI components: ${components}\u00a0components from ${libraries}\u00a0libraries, sorted by category, with live previews`;

  const [serif, display, sans] = await Promise.all([
    googleFont("Newsreader:ital@1", "All"),
    googleFont("Unbounded:wght@300", "Components"),
    googleFont("Manrope:wght@500", line + chips.map((c) => c.name).join("")),
  ]);
  const fonts = [
    serif && { name: "Newsreader", data: Buffer.from(serif, "base64"), style: "italic" as const, weight: 400 as const },
    display && { name: "Unbounded", data: Buffer.from(display, "base64"), style: "normal" as const, weight: 300 as const },
    sans && { name: "Manrope", data: Buffer.from(sans, "base64"), style: "normal" as const, weight: 500 as const },
  ].filter((f) => !!f);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: MARGIN,
        backgroundColor: PAPER,
        // The renderer takes gradient stops as percentages: 7% of a tile's centre-to-corner distance (28px) is a dot
        // 4px across. Each dot sits in the middle of its tile, so shifting the tiles by half lands dots on the grid lines.
        backgroundImage: `radial-gradient(circle at ${GRID / 2}px ${GRID / 2}px, ${DOT} 7%, transparent 0%)`,
        backgroundSize: `${GRID}px ${GRID}px`,
        backgroundPosition: `-${GRID / 2}px -${GRID / 2}px`,
        color: INK,
        fontFamily: "Manrope",
      }}
    >
      <AppMark size={84} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* The home heading: "All" in the italic serif, a little larger so it stands as tall as the wide sans. */}
        <div style={{ display: "flex", alignItems: "flex-start", lineHeight: 1 }}>
          <span style={{ fontFamily: "Newsreader", fontStyle: "italic", fontSize: 116, marginRight: 26, marginTop: ALL_DROP, marginLeft: ALL_INSET }}>All</span>
          <span style={{ fontFamily: "Unbounded", fontWeight: 300, fontSize: 104, letterSpacing: -2.6 }}>Components</span>
        </div>
        <div style={{ marginTop: 26, maxWidth: 980, fontSize: 32, lineHeight: 1.4, color: MUTED }}>{line}</div>
        <div style={{ display: "flex", gap: 12, marginTop: 40 }}>
          {chips.map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 20px", borderRadius: 999, background: CHIP, fontSize: 24 }}>
              {c.color && <div style={{ width: 12, height: 12, borderRadius: 6, background: c.color }} />}
              {c.name}
            </div>
          ))}
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
