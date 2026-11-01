// Every source library gets a stable colour so you can see at a glance where
// each component in the combined collection came from.

// Hues far apart around the wheel, assigned in the order libraries were added,
// so the first ten sources never share a colour.
const HUES = [28, 165, 295, 85, 230, 350, 130, 260, 55, 195];

export function libraryColor(libraryId: number) {
  const i = (libraryId - 1) % HUES.length;
  const lap = Math.floor((libraryId - 1) / HUES.length);
  return `oklch(${0.68 - (lap % 2) * 0.12} 0.15 ${HUES[i] + lap * 14})`;
}

export function LibraryMark({ id, name, size = "sm" }: { id: number; name: string; size?: "sm" | "md" }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${size === "md" ? "text-[15px]" : "text-[13px]"}`}>
      <span aria-hidden="true" className={`shrink-0 rounded-full ${size === "md" ? "h-2.5 w-2.5" : "h-2 w-2"}`} style={{ background: libraryColor(id) }} />
      <span className="truncate">{name}</span>
    </span>
  );
}
