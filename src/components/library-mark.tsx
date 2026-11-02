// Every source library gets a stable colour so you can see at a glance where
// each component in the combined collection came from.

// Hues far apart around the wheel, assigned in the order libraries were added,
// so the first ten sources never share a colour.
const HUES = [28, 165, 295, 85, 230, 350, 130, 260, 55, 195];

function libraryOklch(libraryId: number): [number, number, number] {
  const i = (libraryId - 1) % HUES.length;
  const lap = Math.floor((libraryId - 1) / HUES.length);
  return [0.68 - (lap % 2) * 0.12, 0.15, HUES[i] + lap * 14];
}

export function libraryColor(libraryId: number) {
  const [l, c, h] = libraryOklch(libraryId);
  return `oklch(${l} ${c} ${h})`;
}

/** The same colour as a hex, for image renderers (the share image) that don't read oklch(). */
export function libraryColorHex(libraryId: number) {
  const [L, C, h] = libraryOklch(libraryId);
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  // OKLab to linear sRGB (Björn Ottosson's matrices), then the sRGB curve.
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${linear
    .map((x) => {
      const v = Math.min(1, Math.max(0, x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
      return Math.round(v * 255).toString(16).padStart(2, "0");
    })
    .join("")}`;
}

export function LibraryMark({ id, name, size = "sm" }: { id: number; name: string; size?: "sm" | "md" }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${size === "md" ? "text-[15px]" : "text-[13px]"}`}>
      <span aria-hidden="true" className={`shrink-0 rounded-full ${size === "md" ? "h-2.5 w-2.5" : "h-2 w-2"}`} style={{ background: libraryColor(id) }} />
      <span className="truncate">{name}</span>
    </span>
  );
}
