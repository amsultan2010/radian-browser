# Arc 1.170.0: Developer Mode (live capture)

Captured 2026-10-23. A local page (`python3 -m http.server 8765`, `http://localhost:8765/`) was opened in a new tab of the main window via Arc's AppleScript (`make new tab`). The user's window has the **sidebar hidden** (⌘S state), so the page card fills the window with a 10 pt frame; the sidebar was not toggled. Nothing was copied, captured or saved; DevTools panels were opened and closed again.

Screenshots, prefix `/private/tmp/claude-501/-Users-a-m-sultan-Apps-radian-browser--claude-worktrees-radian-arc-parity-b09e4c/a2376e47-cf2b-4557-9146-fbf07108e540/scratchpad/live/shots/`: `30-devmode.png`, `30b-devbar.png`, `31b-capwin.png`, `32-dev-console.png`, `33-dev-network.png`, `34-dev-inspect.png`, `35-dev-site-settings.png`, `35c-site-more-menu.png`, `37-dev-ext.png`, `38-json.png`, `38c-json-pretty-crop.png`. AX dump: `../ax-sitesettings.txt`.

## When it turns on

Loading `http://localhost:…` switched the tab into Developer Mode immediately (no prompt). The Site Control Center then lists "Developer Mode — On" under Settings (see below). In the sidebar, the localhost tab row is outlined with a **caution-tape border**: alternating yellow `#F8D849` and near-black dashes, ≈ 5 pt each, ≈ 1.5 pt stroke, following the row's rounded corners. The row is two lines tall: title ("Dev test") and a grey second line with `host:port` ("localhost:8765"). Screenshot `tabrow-zoom.png`.

## Developer toolbar

A full-width bar on top of the web content (inside the content card, card radius ≈ 10 pt).

- Height **40 pt**; 1 px lighter bottom line (`#8084FC` over a white page).
- Fill: blue with **45° diagonal stripes**: alternating bands `#6F74FC` / `#7277FC` over a white page; stripe period 45 pt measured horizontally (light band ≈ 21 pt, dark ≈ 24 pt). The bar is translucent: over a dark page (`#121212`) the same bands read `#4147CE` / `#454BCF`. Solving both gives **≈ `rgba(76, 84, 251, 0.81)`** composited over the page's own background colour.
- All glyphs white; URL text in **SF Mono** ≈ 13 pt medium, white, left-aligned, showing the full URL with scheme (`http://localhost:8765`).
- Controls, left → right (x from the bar's left edge; buttons 28 × 28, centred vertically; AX descriptions are the only labels; **no hover tooltips** appeared on any of them):

| # | x | Icon | AX description | What it does |
|---|---|---|---|---|
| 1 | 8 | bold "i" | **Site Settings** | Reveals the sidebar and opens the Site Control Center popover anchored to the sidebar URL bar (below) |
| 2 | 40 | (text field, 923 × 42) | `contentPanelTextField` | The URL, editable |
| 3 | 970 | link | **Copy Link** | Copies the URL (not pressed) |
| – | | thin vertical divider | | |
| 4 | 1026 | framed photo/flower | **Capture Window** | Hover shows a popover (286 × 246): black pill button "Capture in Portrait Mode", a live preview of the page in a blue gradient frame with an Arc-logo watermark, and below it a rainbow hue slider with a circle button on each side (frame colour) |
| 5 | 1054 | camera | **Capture** | Arc's capture tool (not pressed) |
| – | | divider | | |
| 6 | 1098 | terminal `>_` | **Toggle Console** | Chromium DevTools docked **right**, 406 pt wide (page shrinks to 844), 10 pt splitter, Console tab selected; press again closes |
| 7 | 1126 | globe | **Toggle Network Panel** | Same DevTools dock, Network tab selected; press again closes |
| 8 | 1154 | crosshair | **Inspect Element** | Opens DevTools on Elements with the element picker armed; the crosshair button shows a pressed chip (`#7D81FC`, rounded square) while armed |
| – | | divider | | |
| 9 | 1199 | puzzle piece | **Extensions Menu** | Small dark popover (`#050625`, radius ≈ 12, arrow up) with two rows: **Add Extension…** (highlighted `#2F338C`), **Manage Extensions…** |
| 10 | 1227 | split rectangle | **Split View Menu** | Native menu: **Add Right Split**, **Add Left Split**, ─, **Add Top Split**, **Add Bottom Split** |

## Site Control Center (from "Site Settings")

Popover 236 × 254 pt (AX id `siteControlCenterView`), translucent grey material, anchored under the sidebar URL bar's settings icon:

1. Row of four 48 × 32 dark buttons: **Share** (disabled on localhost), **New Boost**, **Capture a portion of this page** (camera), **Capture the full page**.
2. Header **Extensions**, then a 48 × 32 **+** button ("Add Extension"). (This profile has no extensions installed, so no extension icons were shown.)
3. Header **Settings**, then a row: white circle with hammer icon + "Developer Mode" / grey "On" (AX "Developer Mode, On").
4. Hairline, then bottom row: red chip "🔒̸ Insecure" (AX "Lock Off Insecure", 92 × 32) on the left, round **More** (…) button on the right.

"More" menu: **Clear Cache**, **Clear Cookies**, ─, **Manage Boosts…**, **New Boost…**, ─, **Manage Extensions…**, **Add Extension…**, ─, **All Site Settings…**

## JSON rendering

`http://localhost:8765/sample.json` (served as `application/json`) renders with **Chromium's built-in JSON viewer**, not an Arc formatter:
- A 19 pt grey strip at the top (`#3C3C3C`, 1 px light bottom border) containing "Pretty-print" + a checkbox (unchecked by default).
- Body: dark `#121212` (follows macOS dark mode), light-grey monospace (SF Mono, ≈ 12 pt) raw JSON, wrapped.
- Pretty-print on: plain 2-space-indented text; **no syntax colours, no collapsible nodes, no copy/raw/filter controls**.
- The developer toolbar stays on top; its stripes darken over the dark page (see the translucency note above).

## Selection / quotes (checked here too)

Selecting text on the localhost page showed **no floating "Share Quote" control** (waited 3 s). The page context menu on a selection is Chromium's: Look Up “…”, ─, Search Google for “…”, Copy, Copy Link to Highlight, Print…, ─, Inspect, ─, Speech ▸, ─, Writing Tools (Summarize, Show Writing Tools), ─, Services ▸. No quote item.

## Not captured

- The developer toolbar with the sidebar visible (the user keeps it hidden; not toggled).
- Copy Link / Capture / Capture Window actions (would write the clipboard or save captures).
- Tooltips: none appear on these buttons.
