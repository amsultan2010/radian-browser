# Arc 1.170.0: colours (measured)

Sampled 2026-10-23 from 2× window screenshots (`screencapture -l`, sRGB PNG). The theme is the default dark purple space theme. macOS is in Dark mode.

Method:

- Flat colours are means over ≥20×20 px patches.
- Text and icon colours are the mean of the 1.5% of pixels most different from the local background (the glyph cores).
- Overlay alphas assume a white overlay: `alpha = (fill − bg) / (255 − bg)`, averaged over R, G and B.

Screen recordings (ffmpeg/AVFoundation) shift colours by ≈−30 levels, so no colour here comes from a video.

**Light appearance was not measured.** Arc's sidebar light/dark is part of each space's theme, and changing it means using the theme editor, which saves live. macOS appearance is a system setting this task may not change. See the README.

## Window background (the space theme)

A linear gradient over the whole window, behind both the sidebar and the card frame. Fitted with a plane per channel; residual rms <1 level.

| State | Top-left | Top-right | Bottom-left | Bottom-right | Centre |
|---|---|---|---|---|---|
| **Key window (active)** | `#2e3041` | `#3b2941` | `#352c41` | `#412541` | `#382a41` |
| Inactive window | `#161829` | `#221029` | `#1d1429` | `#290c29` | `#1f1229` |

- **Direction:** top-left → bottom-right, about 41° below horizontal (R rises 0.95 per 100 pt in x and 0.83 per 100 pt in y; G falls 0.60 and 0.50; B is flat).
  - CSS for a 1280×800 window: `linear-gradient(131deg, #2e3041, #412541)`. 131° is the CSS angle (0° points up), so the gradient runs top-left to bottom-right.
- **Inactive dimming:** every channel drops by ≈24 levels (−24/−24/−24 ±1) when the window loses key status. That equals a black overlay of ≈40–50% on these dark values. In practice, implement it as `filter: brightness(…)` or a flat subtraction: a fixed `rgba(0,0,0,.45)` overlay over this theme lands within ±3 levels.
- **Grain:** none visible in this theme.
  - After removing the gradient, the residual σ is 0.42–0.49 levels per channel, with values only in {−1, 0, +1}, low channel correlation (0.16–0.20) and no spatial autocorrelation (lag-1 ≤0.1).
  - That is 8-bit dithering of the gradient, not a grain texture.
  - The grain slider's scale and opacity remain unmeasured: that needs a theme with grain > 0.

## Sidebar elements (active window)

| Element | Colour | As an overlay |
|---|---|---|
| Selected tab fill | `#5a5668` on bg `#322d41` | **white 20%** (19.5–20%) |
| Hover fill (any unselected row: tab, folder, "New Tab") | `#464254` on `#322d41` | **white 10%** |
| Selected + hovered | unchanged (`#5a5668`) | white 20% (hover adds nothing) |
| URL field fill | `#424254` on `#2e2d41` | **white 10%** |
| Divider (pinned / today) | `#4f4d5e` on `#312d41`, 1 device px | **white 15%** |
| Empty-favicon placeholder | `#828192` on the selected fill | ≈white 45% over the fill |

Selected and hover fills have no shadow and no border in the dark theme (pixels just outside them equal the background).

## Text and icons (active window)

| Element | Colour | Approx. white alpha over bg |
|---|---|---|
| Primary text: tab title (selected), folder title, favorites heading | **`#dfe1ff`** (lavender-tinted, not pure white) | 0.88–0.90 |
| Space title ("Space 1") | `#a2a1aa` | 0.55 |
| "New Tab" label | `#8e8c97` | 0.45 |
| "+" glyph of New Tab | `#9897a0` | 0.50 |
| URL text in the field | `#b4b4bb` | 0.60 |
| Favorites empty-state body | `#a9aac7` | 0.63 |
| Toolbar icons: sidebar toggle, back, reload; bottom-bar library and "+" | `#aaaab2` | 0.59 |
| Disabled toolbar icon (forward with no history) | `#636271` | 0.25 |
| Inactive space dot (bottom bar) | very dim; ≈white 25% | est |
| Active space icon (bottom bar) | `#9b97a0` | 0.49 |

Inactive window:

- Primary text stays `#dfe1ff`.
- Secondary text stays at the same alpha over the darker background (space title `#96959f`).
- Toolbar icons dim to `#504f5e` (white 25%).
- The URL placeholder is `#6c6c78` (white 30%).

## Page card

- No border.
- Shadow: black at α≈0.25, CSS blur ≈6 pt, offset y +1 pt. See layout/spec.md.
- With no tab selected, the card area shows the window gradient itself; there is no separate card fill. In the inactive main window that patch was `#382a3e`.

## Command Bar (dark, opened with ⌘T over a white page)

| Element | Colour |
|---|---|
| Panel fill | `#3c3c3c`: neutral grey, not theme-tinted |
| Outer outline | `#060606`, 1 device px (0.5 pt) |
| Inner highlight just inside the outline | `#696969`, 2 device px (1 pt): white ≈18% over the fill |
| Separator under the input | `#505050`, 1 device px |
| Selected suggestion row | `#5056de`: the theme's accent, blue-violet |
| Suggestion title text | `#d8d8d8` (≈85% white) |
| "Switch to Tab" on the selected row | `#ffffff` |
| Placeholder "Search or Enter URL…" | `#a7a7a7` |
| Shadow | black α≈0.49, CSS blur ≈85 pt, offset y ≈+24 pt (rms 0.009 over all four sides). At the edges, darkening is 34% below the panel, 24% at the sides and 14% above |

## Developer Mode (seen by accident)

Loading `http://127.0.0.1:…` switched the tab into Arc's Developer Mode. This was observed only:

- The tab row gets a yellow-and-black dashed outline.
- A blue (`#464dd3`, sampled) URL bar with monospaced URL text runs across the top of the card.
