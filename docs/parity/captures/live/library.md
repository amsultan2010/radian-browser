# Arc 1.170.0: Library (live capture)

Captured 2026-10-23 on the user's profile (window 1280 × 800 pt, sidebar hidden). Opened with **⇧⌘L** (Shortcuts list: "View Library ⇧⌘L"; sidebar footer button tooltip "View Library ⇧ ⌘ L"). Each section was visited, then the Library was set back to Media and closed with its back button. The "Your Media in the Library" tip and its **Show Media** button were left untouched.

Screenshots, prefix `/private/tmp/claude-501/-Users-a-m-sultan-Apps-radian-browser--claude-worktrees-radian-arc-parity-b09e4c/a2376e47-cf2b-4557-9146-fbf07108e540/scratchpad/live/shots/`: `50-library.png` (Media + tip), `51-library-downloads.png`, `51-library-easels.png`, `51-library-spaces.png`, `51-library-boosts.png`, `51-library-archived.png`, `52b.png` (footer tooltips). AX dumps: `../ax-library*.txt`.

## Presentation

- **Not a tab and not a separate window.** The Library takes the sidebar's place inside the browser window, as a full-height panel on the left. Window traffic lights stay in the top-left of the panel.
- Panel width **417 pt** for Media, Downloads, Easels, Boosts and Archived Tabs; **744 pt** for Spaces (the Space manager is wider).
- The web content card is **pushed right, not resized**: it keeps its 1270 pt width and runs off the window's right edge.
- Closing: the **←** button bottom-left (tooltip **"Exit Library"**), or ⇧⌘L again. Next to it a gift button (tooltip **"Share Arc"**).

## Layout

- **Left rail** 112 pt wide (`#272638` over the theme gradient), separated from the list by a 1 pt lighter line (`#3A3747`). Six stacked tab buttons, each **97 × 80 pt**, 8 pt from the left, 100 pt pitch starting 105 pt below the top: icon (≈ 24 pt) over a 12 pt semibold label. Selected = rounded chip `#3C3849` (radius ≈ 12) and a filled/blue icon.
  1. **Media**: two stacked photos
  2. **Downloads**: arrow in a circle
  3. **Easels**: easel/drawing card
  4. **Spaces**: two stacked cards
  5. **Boosts**: paintbrush with sparkle
  6. **Archived Tabs**: archive box
- Rail footer (32 × 32 buttons at y = 760): **←** "Exit Library" (x = 8) and **🎁** "Share Arc" (x = 73).
- **Right column** (x = 124 to 405): search field at the top (36 pt tall, `#373748`, radius ≈ 10, magnifier + placeholder), list below grouped under date headings (**Today**, **Yesterday**, 11 pt semibold grey).

## Sections

| Section | Search placeholder | Extra control | Empty / current state |
|---|---|---|---|
| Media | "Search Media…" (disabled until access is granted) | | Grey skeleton rows under Today / Yesterday; centred tip card: media-stack icon, **"Your Media in the Library"**, "Quickly grab screenshots, images, and videos from your computer by showing them in the Arc Library!", gradient pink→blue button **Show Media**, footnote with lock-shield icon "Media never leaves your computer and is not viewable by anyone but you." (close ✕ top-right) |
| Downloads | "Search Downloads…" | **Filter** button (73 × 36) right of the search | 48 pt arrow-down-circle icon, **"Nothing here yet!"**, "Come back after you’ve found some cool stuff to save." |
| Easels | "Search Easels…" | | 48 pt note icon, **"Out of ideas!"**, "Click the + sign in the Sidebar to create a new Easel." |
| Spaces | (no search) | | Space manager: one column card per Space (≈ 240 pt wide, full height, theme-tinted): header = space icon + name + pencil (edit theme) button; pinned items; "↓ Clear" divider; today tabs; footer = move (✥) handle and "…" menu. A round blue **+** button (new Space) sits to the right of the last column. |
| Boosts | "Search Boosts…" | | Boost icon, **"Nothing Boosted Yet!"**, "Click Format in URL bar to make your own, or grab one from the Boost Gallery." |
| Archived Tabs | "Search Archive…" | **Filter** button | Rows under **Today**: favicon 16 pt, title (13 pt) over URL (11 pt grey), both truncated with "…"; row pitch 56 pt |

## Easel / Note opening

Not observable: this profile has **no Easels or Notes**, and creating one would add data. The sidebar **+** menu offers "New Easel ⌃⇧E" (see chrome.md); New Note exists only as a shortcut (⌃⇧N, "New Note (in Split)" ⌃⌥N).
