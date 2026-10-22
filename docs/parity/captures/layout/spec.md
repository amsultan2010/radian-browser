# Arc 1.170.0: layout (measured)

Measured 2026-10-23 in a new Arc window of 1280×800 pt on a 2× display. The window was on the default dark purple theme of "Space 1", with one Today tab showing a blank local white page.

All numbers are in points (pt), relative to the window's top-left corner, unless marked px. px means device pixels at 2×.

**How it was measured**

- **Frames:** from the macOS accessibility tree (AXPosition/AXSize), read by a small AX dumper. REA `observe_native_ui` (`ev_f31bedf776b7cc0e7d600317d5364b0158f4a947f20dc0f2381b45f3aad28f60`) returns the same tree, but without frames.
- **Painted shapes:** from 2× screenshots (`screencapture -l <window>`), scanned for edges.
  - Corner radii were fitted against rasterized circular and Apple-continuous ("squircle") corners.
  - Font sizes were fitted by matching ink widths and cap heights against CoreText renderings of `NSFont.systemFont` at each size and weight.

**Tags**

- **AX**: an accessibility frame (exact).
- **px**: a pixel measurement (±0.5 px = ±0.25 pt).
- **fit**: a model fit; the residual is given.
- **est**: an estimate.

## Window and page card

| Item | Value | Tag |
|---|---|---|
| Window | 1280×800. System corner radius ≈17 pt (macOS 26 chrome; Radian gets it free with a native frame) | AX / px |
| Web content (sidebar shown) | x 228, y 10, w 1042, h 780. Insets: top 10, right 10, bottom 10; left edge at 228 | AX + px |
| Web content (sidebar hidden) | x 10, y 10, w 1260, h 780 (10 on every side) | AX + px |
| Card corner radius | **6 pt, continuous (squircle) curve**. Fit error 0.15 against 0.62 for the best circular fit (6.25 pt). In CSS, `border-radius: 6px` is the closest; a squircle mask matches exactly | fit |
| Card border | none (no light or dark line inside the card edge) | px |
| Card shadow | black, alpha ≈0.25, blur σ ≈3.1 pt (CSS blur ≈6 pt), offset y ≈+1 pt, x 0. With the sidebar hidden, rms 0.003. CSS: `0 1px 6px rgba(0,0,0,.25)` | fit |
| Extra darkening, left of card (sidebar shown) | the sidebar side next to the card is darker over ≈10–20 pt (≈12% at 8 pt from the edge). A second, wider, softer shadow may exist on the left side only | px, est |

## Title-bar row (traffic lights and toolbar)

| Item | Value | Tag |
|---|---|---|
| Close / minimize / zoom | 16×16 at x 12 / 35 / 58, y 16 (23 pt pitch, centres at y 24) | AX |
| Sidebar toggle | 32×32 at x 77, y 7.5. Its label is "Hide sidebar"; it becomes "Lock sidebar" in the hover-revealed overlay | AX |
| Back / forward / reload | 32×32 at x 122 / 156 / 190, y 7.5 (34 pt pitch, 2 pt gap) | AX |
| Glyph sizes (ink) | toggle ≈18.5×14.5; back and forward arrows ≈15×12; reload ≈14×17 | px |

## URL field

| Item | Value | Tag |
|---|---|---|
| Fill rect | x 8–220 (w 212), y 46–82 (h 36) | px |
| Corner radius | ≈12 pt, continuous (fits 11.6–12.0; circular fits 12.0–12.4) | fit |
| Empty state | magnifier button 24×24 at (14, 52); placeholder text frame x 41, y 55, h 18 ("Search or Enter URL…") | AX |
| URL shown | text frame starts at x 20, y 55, h 18. With a page open there is no icon; the host is shown (e.g. "127.0.0.1"; file URLs are shown in full) | AX |
| Font | **13 pt SF, Medium** (ink-width fit Δ0.04 pt; cap height 9 pt) | fit |

## Sidebar column

| Item | Value | Tag |
|---|---|---|
| Sidebar width (window edge to card) | 228 | AX |
| Row and field side insets | 8 pt left and right: the fills run x 8–220 | px |
| Scroll area | y 82 to 750 (the bottom bar sits below 750) | AX |
| Favorites block | y 82–187.5. Only the empty state was measured: a dashed rounded box ≈x 6–222, y 70–144 px/2, with a 16.5 pt star icon centred at y 110, a 13 pt semibold title and an 11–12 pt two-line body | AX / px |
| Space title row | icon 26×26 at (13, 200.5). Text frame x 41, y 204.5, h 18. Font **13 pt SF Semibold** (fit Δ0.37, cap 9 pt). The "More" (…) button sits at x 213, w 2 (collapsed until hover) | AX / fit |
| Pinned list | starts at y 231.5 with a 3 pt spacer row | AX |
| Row pitch | **41 pt**, for folder, tab and "New Tab" rows alike | AX |
| Clickable tab button | 40 pt tall, full width 0–228 | AX |
| Fill (selected / hover) | **36 pt tall** (2 pt above, 3 pt below inside the 41 pt pitch), x 8–220, radius ≈12 pt continuous (fits 11.75–11.9) | px / fit |
| Favicon | frame 18×18 at x 17 (centre x 26), vertically centred. The empty-favicon placeholder is a 14×14 rounded square | AX / px |
| Title text | x 43; frame h 19 | AX |
| Title font, tab | **14 pt SF Regular** (ink width 64.5 pt fits 14 pt Regular within Δ0.07; cap height 10 pt = 14 pt × 0.705) | fit |
| Title font, folder | **14 pt SF Semibold** (fit Δ0.28) | fit |
| "New Tab" label | 14 pt Regular, dim colour (see colors/spec.md); "+" glyph ≈11.5 pt inside an 18×18 frame at x 17 | fit / px |
| Folder icon | filled folder glyph ≈19 pt wide, left edge ≈x 13 | px, est |
| Divider row (pinned / today) | the row is 17 pt tall (y 275.5–292.5). The line sits at **y 283**, x 18–210 (w 192), **1 device px (0.5 pt) thick**, white at ≈15% | AX / px |
| "Clear" control | in the hover-revealed overlay a "↓ Clear" label appears at the right end of the divider row | screenshot |

## Bottom bar

| Item | Value | Tag |
|---|---|---|
| Library ("Home") button | 32×32 at (8, 759); glyph ≈13.5×16.5 | AX / px |
| Space dock (scroll area) | x 42–186, y 750–800 (w 144, h 50) | AX |
| Space icons | 36×34 each, centred as a group. With 2 spaces they sit at x 79 and 113 (34 pt pitch), y 758. Glyph: the active space's icon ≈14×10; an inactive space without an icon is an 8×8 dot | AX / px |
| "+" (new space / item) | 32×32 at (188, 759); glyph 14×14 | AX / px |

## Hover-revealed sidebar (sidebar hidden, pointer at the left edge)

- The overlay panel slides in over the page; the card does not reflow.
- When fully out, its right edge (including shadow) reaches x ≈233 at mid-height.
- Inside the overlay, AX frames sit 5 pt lower at the top and 5 pt higher at the bottom than in the docked sidebar: toolbar buttons at y 12.5 instead of 7.5, the "+" button at y 754 instead of 759. This is consistent with a floating panel inset ≈5 pt from the window edges.
- The panel is moved off-screen with a translation of −238 pt (−228 width −10).
- Hot-zone width and reveal delay are not measured yet (see the README).

## Typography summary (SF Pro via `NSFont.systemFont`)

| Use | Size / weight | Colour role |
|---|---|---|
| Tab title | 14 Regular | primary |
| Folder title | 14 Semibold | primary |
| "New Tab" | 14 Regular | secondary (≈45% white) |
| Space title | 13 Semibold | secondary (≈55% white) |
| URL text / placeholder | 13 Medium | secondary |
| Favorites empty-state title | ≈13 Medium–Semibold (width fits 13 Medium; cap height suggests 13.5) | primary |
| Favorites empty-state body | ≈11.5–12 Regular (width fits 11.5 Regular) | tertiary |

## Not measured here

- **Favorites grid** (tile size, gaps, columns): this Arc has no favorites. Adding some would change the user's data, so the grid is unmeasured.
- **Pinned tab rows inside an open folder**: needs the folder-open experiment (motion/).
- **Sidebar min and max width**: needs a pointer drag on the sidebar edge.
