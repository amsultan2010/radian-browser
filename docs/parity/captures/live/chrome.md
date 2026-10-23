# Arc 1.170.0: sidebar chrome, quotes, Little Arc (live capture)

Captured 2026-10-23 on the user's profile. The user's main window keeps the **sidebar hidden**; it was revealed only by hovering the window's left edge (it then floats over the content as a card with a drop shadow, AX image "CellDropShadow" 250 × 812). Tooltips were read by hovering ≈ 2 s.

Screenshots, prefix `/private/tmp/claude-501/-Users-a-m-sultan-Apps-radian-browser--claude-worktrees-radian-arc-parity-b09e4c/a2376e47-cf2b-4557-9146-fbf07108e540/scratchpad/live/shots/`: `42b-urlbar-quote.png`, `43b-quote-preview.png`, `top-tips-1.png`, `top-tips-2.png`, `bottom-tips.png`, `44-reload-menu.png`, `45-plus-menu.png`, `50-littlearc.png`, `50b-littlearc-openin-menu.png`, `50c-littlearc-link-hover.png`, `50e-hover-chevron.png`, `54-littlearc-new.png`.

## Sidebar top row (left → right, 32 × 32 hit areas)

| Control | AX description | Tooltip (exact) |
|---|---|---|
| Sidebar toggle (rectangle with left pane) | "Lock sidebar" while the sidebar is hidden/floating | **"Lock sidebar ⌘ S"** (keycaps) |
| ← | "Go back" | **"Go back ⌘ ["** |
| → | "Go forward" (disabled when no history) | (not shown when disabled) |
| ⟳ | "Reload this page" | none |
| ⌄ (only in Developer Mode, 8 pt chevron right of ⟳) | | none; click opens a menu: **Reload**, **Refresh (Ignore Cache)**, ─, **Clear Cookies and Refresh** |

## Sidebar URL bar

- Shows the host only ("localhost"), 13 pt, in a rounded field.
- Right-hand icons (30 × 30, visible on hover): **link** ("Copy Current URL", id `copyLinkButton`) and **sliders** ("Site Control Center", tooltip **"Site Control Center"**). Click on sliders opens the Site Control Center popover (devmode.md).
- **Pinned extension icons**: none could be shown: this profile has **no extensions installed** (the Site Control Center's Extensions section only has "+"). Where they would sit was therefore not observable.

## Share Quote (text selection)

With text selected on the page (and "Enable Shared Quotes when highlighting text" on):
- **No floating control appears on the page**, and the page context menu has no quote item.
- Instead the **sidebar URL bar changes**: line 1 = host in smaller grey text, line 2 = bold **"Share Quote"** (AX button title "Share Quote", 81 × 17; underlines on hover, no tooltip).
- The link icon is replaced by a **speech-bubble-with-quote icon** (AX "Copy Current URL as Quote", id `copyShareQuoteLinkButton`). Hover shows a rich tooltip: header **"Copy Quote as URL"** + keycaps **⌃ ⇧ ⌘ C**, above a ≈ 236 × 130 pt blue `#2745EC` preview card with lighter skeleton text bars (`#4A63EF`), on the navy tooltip panel (`#0A0D4B`, radius ≈ 12).
- Not clicked (it would upload the quote and write the clipboard).

## Sidebar list extras

- Hovering the divider above today's tabs shows **"↓ Clear"** at its right end (clear unpinned tabs).
- Developer-Mode tabs: caution-tape border and a host:port second line (devmode.md).

## Sidebar footer (bottom bar)

| Position | Control | Tooltip |
|---|---|---|
| left (x = 13, 32 × 32) | Library (archive box with sparkle), AX "Home" | **"View Library ⇧ ⌘ L"** |
| centre | Space dock: one 36 × 34 button per Space (Space icon, e.g. planet; a plain dot for a Space without icon) | **"Space 1 ⌃ 1"**, **"Space 2 ⌃ 2"** (shown above the icon) |
| right (32 × 32) | **+** (id `sidebarPlusButton`) | none; turns into **✕** while its menu is open |

**+ menu** (navy popover `#050625`, 222 × 308, rounded, arrow down to the button), items with 20 pt line icons:
New Space · New Folder · ─ · New Easel ⌃⇧E · New Boost (dimmed) · ─ · New Split ⌃⇧= (dimmed) · **New Tab ⌘T** (pre-highlighted row, `#2F338C`-ish).
There is **no "New Note"** in this menu.

## Tooltip style (all Arc custom tooltips)

Navy pill `#0A0D4B`, white 12–13 pt semibold label, shortcut keys as separate light keycaps (`#D3D4FD`, navy glyph, ≈ 16 × 16, radius 4). Appears ≈ 1 s after hover, 6–8 pt below the control (above it for the footer dock).

## Little Arc

Two entry paths were seen:

1. **⌥⌘N** (from any app): a borderless **490 × 329 pt command-bar window** (AX subrole `AXSystemDialog`), placed **20 pt from the right edge and 50 pt from the top of the active display** (just under the menu bar) (here the main display, not the one Arc's window was on). Contents: magnifier + "Search or Enter URL…" field, a 26 × 26 ✕ button (no tooltip), hairline, then 50 pt suggestion rows (first row pre-selected, `#4B51D9`). Background `#262227`. Escape closes it.
2. A link opened from elsewhere (here: an ⓘ in Settings) opens a full Little Arc window (1185 × 832 here):
   - Toolbar 47 pt, dark (`#232A39` / `#242734`), traffic lights, then a single rounded URL field (`#3C3B4B`) with a magnifier on the left, the **host centred** ("resources.arc.net"), and a **link icon** at its right end (tooltip **"Copy URL ⇧ ⌘ C"**).
   - Right of the field: **"Open in Space 1 ⌘O"** button (`#050625` fill; "Open in" grey, Space name bold white, ⌘O keycap) and a separate **⌄** button (tooltip **"More Spaces"**) that opens a "Search Spaces…" list of all Spaces with their icons.
   - **No extensions button** and no other toolbar controls.
   - Floating round buttons on the right edge (34 × 33, appear on hover): "Close", "Enter Full Screen".
   - First-run coach mark (blue `#3139FB` card, top-right): **"Links Open in *Little Arc*"** / "Click “Open in” to move this page in a full window, or ⌘W to close".
- Over a full-screen app: **not tested** (would require putting one of the user's apps into full screen).

## Peek (seen while measuring motion)

Shift-click on a link: a **1024 × 776 pt** panel centred horizontally, 12 pt from the window top, over a dimmed and slightly shrunk page; a vertical stack of round navy buttons to its right (34 × 33): **Close**, **Enter Full Screen** (expand arrows), **Square Split Two By One** (open in split). The hovered link's URL shows as a navy pill bottom-left.
