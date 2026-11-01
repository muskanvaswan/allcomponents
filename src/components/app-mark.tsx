// The site's mark for icons and link previews, drawn for ImageResponse (flexbox
// only): four rounded tiles on the pale blue accent, like a grid of components,
// with one of them round.

const INK = "#1d1d1f";

export function AppMark({ size, rounded = true }: { size: number; rounded?: boolean }) {
  const tile = size * 0.25;
  const gap = size * 0.0625;
  const corner = tile * 0.28;
  const square = (opacity: number, radius = corner) => <div style={{ width: tile, height: tile, borderRadius: radius, background: INK, opacity }} />;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap,
        background: "#d6e6ff",
        borderRadius: rounded ? size * 0.22 : 0,
      }}
    >
      <div style={{ display: "flex", gap }}>
        {square(1)}
        {square(0.35)}
      </div>
      <div style={{ display: "flex", gap }}>
        {square(0.35)}
        {square(1, tile / 2)}
      </div>
    </div>
  );
}
