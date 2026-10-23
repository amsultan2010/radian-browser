# Arc 1.170.0: Settings window (live capture)

Captured 2026-10-23 on the user's own Arc profile (macOS dark mode, 2× display), read-only: AX tree via a small AXUIElement dumper plus `screencapture -l<window>`. Nothing was toggled. Popup menus were opened and dismissed with Escape; values were re-read afterwards and were unchanged. Account email is redacted.

Screenshots (scratch dir, not in the repo), prefix `/private/tmp/claude-501/-Users-a-m-sultan-Apps-radian-browser--claude-worktrees-radian-arc-parity-b09e4c/a2376e47-cf2b-4557-9146-fbf07108e540/scratchpad/live/shots/`:
`10-settings-first.png` (account), `11-settings-general.png`, `11c-general-previews-sheet.png`, `12-settings-profiles.png`, `13-settings-max.png`, `14-settings-links.png`, `15-settings-shortcuts.png`, `15b-crop.png`, `16-settings-icon.png`, `17-settings-advanced.png`, `10b-account-menu-crop.png`. Raw AX dumps: `../ax-settings-*.txt`.

## Window

- Opened with ⌘, ; a separate standard window (close button only active; minimize and zoom are disabled).
- Size: **684 × 650 pt**. Panes with a scroller (Profiles, Max, Links) widen to **701 × 650** (the legacy scroller, 17 pt, is added outside the 684 content width).
- Title bar 32 pt; window title = the selected pane name (first pane = the user's first name, e.g. "Abdullah").
- Toolbar: `NSToolbar` preference style, 56 pt tall, items centred, icon above label. Item buttons 55 pt wide (Shortcuts 63, Advanced 64, account 58) × 56 tall.
- Selected item: rounded-rect chip `#474746` behind icon + label, icon and label tinted system blue (`#3478F6` ≈). Unselected labels/icons light grey.
- Font: SF Pro (system), 13 pt body; card section headers 11 pt grey.
- Colours (dark): title bar + toolbar `#2B2B2A`, 1 px divider under toolbar `#333232`, content background `#242323`, card fill `#272626`, card border and row separators `#3A3939`–`#3C3B3B` (1 px), card corner radius **8 pt**, push-button fill `#323131`, switch on `#387AF4` (knob `#E1EBFE`), switch off track `#3B3A3A` (knob `#E2E2E2`).
- Card geometry: cards inset 64 pt from the window's left and right, 20 pt below the toolbar, rows inset 10 pt inside the card; separators inset 8 pt. Toggle rows ≈37–41 pt tall. Switches are the small `NSSwitch` (36 × 16).

## Pane order (toolbar, left → right)

1. **<user's first name>** (account), icon: ID card with "@"
2. **General**, icon: gear
3. **Profiles**, icon: person
4. **Max**, icon: four-petal flower
5. **Links**, icon: stacked windows
6. **Shortcuts**, icon: keyboard
7. **Icon**, icon: Arc "A" logo outline
8. **Advanced**, icon: three sliders

## 1. Account pane (first name)

Top banner (grey pill, centred): text "Arc isn‘t your default browser." + blue button "♥ Make Arc your default" (shown only when Arc isn't default).

Left: membership card 240 × 360 pt (cream `#FFFDEC`, animated gradient blob arch on top, name in bold purple, title "ARTSY TEACHER", anniversary stamps with tooltips "One year with Arc!", "Two years with Arc!", footer "ARC | <join date>" and "BROWSER COMPANY" wordmark). Under it three icon buttons: **Share**, **Download**, **Six-Sided Die Showing One Pip** (randomise card).

Right column, three cards:
- Card 1: "Account" + email + `…` button (menu: **Change Email…**, **Change Name…**, **Reset Password…**, separator, **Delete Account…**). Second row: "Verify your email to complete account setup." + button **Send Verification Email** (only for unverified accounts).
- Card 2: "Sync Sidebar" + toggle (off). Footer text: "Arc Sync is end-to-end encrypted, only you can see your data. [Learn more] or view your [Recovery Card]."
- Card 3: "Gift Arc to a Friend" + button "🎁 Share Arc". Footer: "Share Arc to unlock exclusive app icons! [Click here] or in the **Icon** tab in settings for details."

## 2. General

Card 1:
| Label | Control | Value |
|---|---|---|
| Automatically update my Arc ⓘ | switch | off |
| Warn before quitting | switch (`warnBeforeQuitPreference`) | on |

The ⓘ button opens the help article "Update Arc for Desktop" **in a Little Arc window** (all ⓘ buttons in Settings open resources.arc.net articles in Little Arc).

Card 2:
| Label | Control |
|---|---|
| Previews | button **Previews Settings…** |
| Manage your default search engine, Auto-Archive, and downloads in Profile Settings. (two lines) | button **Profile Settings…** (jumps to Profiles) |

**Previews Settings… sheet** (422 × 372 pt, dark navy `#161C2F`, radius ≈ 20 pt):
- Title "Show Arc Previews:" (bold)
- Body "Save a click! Hover your mouse over an Arc Folder, Pinned, or Favorited tab to quickly preview what you need from that site! [Learn more]"
- Checkboxes (all on by default, blue `#397BF7`): Arc Folders · Google Calendar · Google Mail · Outlook Calendar · Outlook Mail · Recent pages on Linear, Notion, and Figma · Notion Calendar
- Button **Done ⏎** (bottom right, 92 × 38, `#3339F1`, return-key keycap inside).

## 3. Profiles

Intro text: "Profiles help keep your data separate across Spaces — like history, logins, cookies, and extensions. You can use any Profile across one or more Spaces. [Learn more.]"

Left: source list 205 × 445 pt, header "Your Profiles"; rows 40 pt: "Default" + right-aligned grey "2 Spaces"; selected row fill `#242934`. Bottom bar: **+** (Add), **−** (Remove; disabled, tooltip "The Default Profile cannot be deleted."), Autofill button (rectangle.and.pencil.and.ellipsis icon).

Right (per selected profile):
Card A:
| Label | Control | Options (order) | Value |
|---|---|---|---|
| Search engine | popup (AX "Default Search Engine") | Google, DuckDuckGo, Brave, Microsoft Bing, Ecosia, Perplexity | Google |
| Manage search | button **Search Settings…** | | |
| Include search engine suggestions | switch | | on |

Card B:
| Label | Control | Options (order) | Value |
|---|---|---|---|
| Archive tabs after ⓘ | popup | 12 hours (default), 24 hours, 7 days, 30 days | 12 hours (default) |
| New documents | popup (AX "Default Document App") | —— , Confluence Page, Google Doc, Notion Page, Word Doc | —— (none) |
| Download location | popup (AX "Download Location", folder icon) | Downloads, Other…, separator, Ask every time | Downloads |

**"New documents" is the notes/docs app choice** (per profile). There is no separate "New Note" app setting; New Note (⌃⇧N) / New Easel (⌃⇧E) are Arc-native (see Shortcuts).

Section header "Your Data and Settings" (11 pt grey), then a card of navigation rows (each: 24 pt coloured rounded-square icon, label, blue → arrow on the right):
1. Privacy and Security: blue `#3C7FD8`, lock
2. Passwords: green `#5EB55D`, key
3. Credit Cards: yellow `#D9BD43`, card "123"
4. Notifications: orange `#D28643`, bell
5. Clear Browsing Data: red `#CE4C48`, trash

## 4. Max

Hero banner 684 × 128 pt: blue `#343BF5`–`#3C42F5` with grain, scattered pink "MaxFlower" glyphs, "MAX" wordmark, wavy bottom edge.
Text: "Let Arc do more for you with Max, so you can do less. Power up your browsing with AI and spend time on the things that matter — on or off screen."

Card 1: (flower icon) "Enable Max" + filled blue button **Turn On Max**; "Automatically enable future Arc Max features" + switch (off).

Card 2, each row = 88 × 56 preview thumbnail + title + grey description + switch (all off here):
1. **Tidy Tabs**: "Press the [broom] icon to let your Sidebar organize itself whenever you have more than six Today Tabs."
2. **Instant Links**: "Press Shift + Enter for any web search to instantly open the top result. [You can also search multiple queries!]"
3. **5-Second Previews**: "Instant summaries appear when you hover over links on [certain websites.] Or hold Shift while hovering to preview any link."
4. **Tidy Tab Titles**: "Have your tabs automatically renamed with tidier, shorter titles when you Pin them."
5. **Tidy Downloads**: "Keep your many files more organized with smartly renamed downloads — and make them a little easier to find later."
6. **ChatGPT in the Command Bar**: "Add ChatGPT to your Search suggestions, or start typing “ChatGPT”, hit Tab, to ask any question instantly."

Footer (centred, small grey): "Max features require that we send data to our AI partners." + link "Learn more about what we send".

## 5. Links

Hero 684 × 135 pt (salmon `#D28485`, a Little Arc mock with "Work" chip, "arc.net", "Open in Work ⌘O", wavy bottom).
Text: "Little Arc is a smaller, simpler Arc window. It’s perfect for quick lookups and reading funny tweets your friends send you."

Card 1 (switches, full-row labels):
| Label | Value |
|---|---|
| Open Little Arc when I press ⌥⌘N in any app | on |
| Open Little Arc when clicking on links with ⌥⌘ held | on |
| Links from other apps open in Little Arc | on |
| Archive Little Arcs after: (popup: 1 hour, 6 hours (default), 12 hours) | 6 hours (default) |

Horizontal rule, then text: "Peek is a way to preview a link without opening a new tab. It’s perfect for quickly looking at a link from an email, news article, or tweet."

Card 2:
| Label | Sub-text | Value |
|---|---|---|
| Open a Peek window when clicking on links with Shift held | | on |
| Open a Peek window when clicking on links to other sites | *Note: This only affects Favorites and Pinned tabs* (italic grey) | on |

Bottom row: "Choose where links open inside Arc. ⓘ" + button **Air Traffic Control…**.

## 6. Shortcuts

Top banner (grey pill): "Start with the basics" + blue button "⌘ Learn the Essential Shortcuts".
Left: search field placeholder "Type a feature name or shortcut (like “Command E”)", then a 340 × 408 list, section header "Default Shortcuts"; rows 48 pt: action name left, white rounded keycap box (≈ 63 × 24) with the shortcut, or "---" when unset. Right: two big blue keycaps (⌘ and a smiley), title "Custom Shortcuts", grey text "Change shortcuts for your favorite actions, and even choose whether Arc or a website takes priority."; bottom: **Reset All Shortcuts** (disabled when nothing customised) + `…` menu with one item **Extension Shortcuts…**.

Full list, in order (as displayed, alphabetical; "---" = no default):
Add Split View ⌃⇧= · Archive Tab ⌘W · Blank Window ⌃⌘N · Capture Full Page --- · Capture in Portrait Mode --- · Capture… ⇧⌘2 · Cast --- · Clear Archive --- · Clear Cookies and Refresh --- · Clear Unpinned Tabs ⇧⌘K · Close Window ⇧⌘W · Close this Split Pane ⌃⇧- · Collapse All Folders --- · Copy URL ⇧⌘C · Copy URL as Markdown ⌥⇧⌘C · Copy URL as Quote ⌃⇧⌘C · Developer Tools F12 · Developer Tools (Alternate) ⌥⌘I · Duplicate --- · Enter/Exit Full Screen ⌃⌘F · Exit ⎋ · Expand All Folders --- · Find Next ⌘G · Find Previous ⇧⌘G · Find and Replace ⌥⌘F · Find… ⌘F · Force Refresh the Page ⇧⌘R · Go Back ⌘← · Go Back (Alternate) ⌘[ · Go Forward ⌘] · Go Forward (Alternate) ⌘→ · Go to Sidebar Item 1…8 ⌘1…⌘8 · Go to last Sidebar Item ⌘9 · Hide Arc ⌘H · Hide Other Windows ⌥⌘H · Inspect Elements ⌥⌘C · JavaScript Console ⌥⌘J · Join Meeting ⌃⌘J · Jump to Selection ⌘J · Manage Spaces… (none shown) · Minimize Window ⌘M (with a ⚠ warning icon) · Network Inspector --- · New ChatGPT Message… ⌥⌘G · New Easel ⌃⇧E · New Folder… (none shown) · New Incognito Window ⇧⌘N · New Little Arc Window ⌥⌘N · New Note ⌃⇧N · New Note (in Split) ⌃⌥N · New Space… --- · New Tab… ⌘T · New Window ⌘N · Next Space ⌥⌘→ · Next Tab ⌘} · Next Tab (Alternate) ⌥⌘↓ · Open Command Bar ⌘L · Open Extensions ⌘E · Open Little Arc or Peek in… ⌘O · Paste and Match Style ⇧⌘V · Pin/Unpin Tab ⌘D · Preferences… ⌘, · Previous Space ⌥⌘← · Previous Tab ⌘{ · Previous Tab (Alternate) ⌥⌘↑ · Print ⌘P · Quit Arc ⌘Q · Refresh the Page ⌘R · Rename Current Item (none shown) · Reset Tab to Original URL --- · Reset all tabs in this Space --- · Restore Last Closed Tab ⇧⌘T · Reveal Current Tab ⌃Space · Reveal Tab in Sidebar (none shown) · Save Page As ⇧⌘S · Separate Page from Split View (none shown) · Share… (none shown) · Show Little Arc “Open In” Menu ⇧⌘O · Show/Hide Sidebar ⌘S · Show/Hide Toolbar ⇧⌘D · Go to “Space 1” ⌃1 · Go to “Space 2” ⌃2 (one row per space) · Stop Loading ⌘. · Switch to Split View 1…4 ⌃⇧1…⌃⇧4 · Switch to next Split View ⌃⇧] · Switch to previous Split View ⌃⇧[ · Tab Switcher (backward) ⌃⇧⇥ · Tab Switcher (forward) ⌃⇥ · Toggle Developer Mode ⌃D · Use Selection to Find --- · View Archive --- · View Downloads ⇧⌘J · View History ⌘Y · View Library ⇧⌘L · View Source ⌥⌘U · Zoom In ⌘+ · Zoom Out ⌘- · Zoom to Actual Size ⌘0.

## 7. Icon

One card (556 pt wide) containing a **single-column list**, not a grid: 6 rows, 81 pt pitch, each row = radio button (22 pt, selected = blue `#3339F1` fill with white ring) + 64 × 64 icon preview + name (bold 15 pt) + optional caption. Rows separated by inset hairlines.

| # | Name (AX image) | Caption |
|---|---|---|
| 1 | The Original Arc (`AppIconOriginalPreview`) | "CURRENT ICON" (blue caps, shown under the selected one) |
| 2 | Candy Arc (`AppIconCandyPreview`) | "by Dmitry Novikov" (italic, inline after the name) |
| 3 | Neon (`AppIconNeonPreview`) | |
| 4 | Fluted Glass (`AppIconFlutedGlassPreview`) | |
| 5 | Schoolbook (`AppIconSchoolbookPreview`) | |
| 6 | Colorful (`AppIconColorfulPreview`) | |

No locked/"share to unlock" icons were listed on this profile.

## 8. Advanced

Each row: 24 pt coloured rounded-square SF Symbol tile (white glyph), label, switch on the right.

Card 1 (blue tiles `#3F8FF7`):
| Icon | Label | Value |
|---|---|---|
| speaker.wave.2.fill | Play Arc sound effects | on |
| hand.tap.fill | Haptic feedback when reordering tabs | on |

Card 2:
| Tile | Icon | Label | Sub-text | Value |
|---|---|---|---|---|
| green `#68CE67` | macwindow | When opening Arc, restore windows from previous session (`restoreWindowsPreference`) | | off |
| green `#68CE67` | rectangle.topthird.inset.filled | Allow window dragging from the top of webpages | | on |
| red `#EB534E` | ellipsis.rectangle | Show full URL when Toolbar is enabled | | off |
| red `#EB534E` | quote.opening | Enable Shared Quotes when highlighting text. | "If disabled, you can still copy URL as a quote using ⌃⇧⌘C." | on |

Card 3 (purple `#CA43EA`):
| Icon | Label | Value |
|---|---|---|
| play.square | Enable Picture in Picture when you leave a video tab (`enablePipPreference`) | on |
| paintpalette.fill | Allow websites to get your theme data | on |
| paintbrush.fill | Enable Boosts on websites you visit | on |

Bottom buttons row: **More Settings…**, **Reset Translated-site Prompts** (left), **Export Data** (right aligned).

## Not captured

- Where **Search Settings…**, **More Settings…**, **Air Traffic Control…**, **Export Data** and the Profiles data rows lead (not opened, to avoid side effects/tabs).
- Light-mode colours (macOS appearance not changed).
