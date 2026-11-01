# Components design system

> Source of truth for the site's look. Page-specific overrides live in `design-system/lookbook/pages/<page>.md`; if one exists it wins over this file.

**Direction: Apple design language** with a pale blue accent (`#D6E6FF`). (History: generated with UI/UX Pro Max as "Swiss index" with a yellow accent; the owner then asked for Apple's softer language — paper backgrounds, rounded surfaces, no harsh borders — and later chose pale blue over yellow.)

## Principles

- **Deference.** The components are the content; chrome stays quiet so previews from different libraries read clearly.
- **Depth, not borders.** Surfaces sit on a light grey paper and are separated by soft shadows and spacing. Hairlines (`--line`) only where a list needs separators.
- **Rounded, friendly geometry.** Cards 16–22px, controls 10px, buttons and chips fully rounded (pills).
- **One accent.** Pale blue marks the primary action and the current selection. It is a fill, never text or a thin line: against the light paper it is only about 1.2:1, so it relies on ink text on top and on shape, not on contrast with the page.

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F5F5F7` | `#000000` | Page background |
| `--surface` | `#FFFFFF` | `#1C1C1E` | Cards, panels, inset lists |
| `--ink` | `#1D1D1F` | `#F5F5F7` | Text |
| `--muted` | `#6E6E73` | `#98989D` | Secondary text |
| `--line` | `rgb(0 0 0 / .08)` | `rgb(255 255 255 / .1)` | List separators, search menu divider |
| `--fill` | `rgb(118 118 128 / .12)` | `rgb(118 118 128 / .24)` | Search button, secondary buttons, chips |
| `--fill-strong` | `rgb(118 118 128 / .2)` | `rgb(118 118 128 / .36)` | Hover on fills, switch track |
| `--accent` | `#D6E6FF` | `#D6E6FF` | Primary button, active chip, current selection |
| `--accent-hover` | `#C7D9F5` | `#E5F3FF` | Primary button hover (darker in light, lighter in dark) |
| `--accent-soft` | accent @ 75% | accent @ 16% | Selected sidebar row, focus halo, text selection |
| `--on-accent` | `#1D1D1F` | `#1D1D1F` | Text on accent (13.3:1) |
| `--scrollbar` | `rgb(0 0 0 / .2)` | `rgb(255 255 255 / .2)` | Scrollbar thumb while scrolling (`--scrollbar-hover` at .38 under the pointer) |
| `--dot` | `rgb(40 80 150 / .16)` | `rgb(214 230 255 / .13)` | Blueprint dots on the page background |
| `--danger` | `#D70015` | `#FF6961` | Destructive |
| `--ok` | `#248A3D` | `#30D158` | Success |

Shadows: `--shadow-card` (resting card), `--shadow-raised` (hover). In dark mode shadows become a faint 1px light ring.

Keyboard focus: a 3px outline mixed 40% accent / 60% ink, so it stays visible on white surfaces.

## Type

- System stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text"/"SF Pro Display"` (renders SF Pro on Apple devices), Inter as the fallback elsewhere. `ui-monospace / SF Mono` for code.
- Large title 34–44px bold, tracking −0.025em. Title 20–24px semibold. Body 15–17px. Footnote 12–13px.
- Sentence case everywhere; section labels are 12–13px semibold muted (no all caps).

## Components

- **Toolbar:** no background, no bottom edge, no logo, and not sticky: it scrolls away with the page (⌘K still opens search anywhere). The theme switch and, to its right, the search button share one glass capsule (surface at 60% with blur, the card shadow); the hidden sidebar's toggle is a glass circle at the left end. The controls start 20px from the top, level with the floating sidebar's top edge. It sits in the content column beside the home sidebar.
- **Page background:** blueprint paper, `--paper` with a 22px grid of 1px `--dot` dots (blue-grey, faint) that scrolls with the page.
- **Headings:** generous space beneath every heading (page titles 40px to the content, section titles 16px). The unfiltered home grid is titled "All Components", and the line under it says what the site is: "An aggregator of UI components: N components from …, sorted by category, with live previews and links to the originals."
- **Name and mark:** the site is called **Components** (src/lib/site.ts). It has no logo in the page chrome; its mark, used only for the tab icon, home-screen icon and link-preview image, is four rounded ink tiles (two solid, two at 35%, one of the solid ones round) on the pale blue accent (src/components/app-mark.tsx).
- **Read-only site:** production shows no editing: the sidebar's "Add a library" link reads "Libraries" and leads to a plain list, and the category picker on component pages is hidden.
- **Pointer:** a white cartoon hand (public/cursors/hand.svg, drawn for this site) everywhere; over anything clickable it turns pale blue with a blue outline (hand-hover.svg). Text fields keep the text cursor.
- **Sound:** original synthesized interface sounds in a games-console spirit (src/lib/sounds.ts). Clicking plays a short, low, dry tick (a 30ms triangle-wave blip on B4, 494Hz, with a brief noise strike and only a touch of echo); search plays two ticks rising when it opens and falling when it closes. Keep sounds low: everything around 1–2kHz was too high pitched. Hovering is silent. Quiet, nothing before the first interaction, and a mute button in the toolbar capsule (remembered per viewer).
- **Loading:** very quiet. Placeholder tiles are surface at 40% with no shadow. Waiting tiles share one slow ripple that rolls across the grid along its diagonals, like a Wii menu: each tile swells to a 3% ink tint and back over 2.6s, 160ms after the diagonal before it, so neighbouring diagonals are just a shade apart. No motion with reduced motion.
- **Search:** a 36px pill button inside the toolbar capsule (magnifier, "Search", a `⌘K` key cap) that opens a modal search menu, also on ⌘K / Ctrl+K. Results arrive as you type; the first row opens the full results page, the highlighted row uses `--accent-soft`.
- **Theme switch:** a 36px round icon button (sun / moon), no visible label. It switches the whole site and the live previews together; until a viewer picks, the site follows the system setting.
- **Primary button:** accent pill with ink text. **Secondary:** `--fill` pill. **Tertiary:** text button with `--fill` on hover.
- **Sidebar (macOS style):** a frosted-glass panel (surface at 55%, heavy blur) floating at the window's left edge with a 20px margin, 22px radius and the card shadow, as tall as the window less its margin; the page fills the width beside it. Its toggle sits at the panel's top right; hiding the panel (remembered per viewer) moves the toggle to the toolbar's left end. Rounded rows; selected category uses `--accent-soft`; counts muted. Libraries are checkboxes (any mix; none ticked means all), drawn as ink squares with a surface tick (the pale accent would vanish against white). No clear-filters button and no animated filter.
- **Scrollbars:** no track; a translucent pill thumb, inset 3px, that shows only while its area is scrolling or under the pointer.
- **Tile:** white card, 16px radius, preview on top, caption below; shadow lifts on hover (no movement).
- **Segmented control** (code file tabs): `--fill` track, selected segment is a white pill with a small shadow.
- **Inset grouped list** (libraries page): one white rounded card, rows separated by `--line`.

## Motion

150–200ms colour/shadow transitions. No hover translate or scale. Respect `prefers-reduced-motion`.

## Avoid

Hard 1px black rules · square corners · thick borders around everything · labelled toggle buttons · accent-coloured text or thin accent lines on light backgrounds · gradients as decoration.
