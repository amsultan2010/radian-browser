# Arc 1.170 Settings window: spec and Radian diff

Arc's Settings window for macOS, pane by pane, then Radian's current settings and how each control maps across. Source keys are at the bottom. Items marked *(inferred)* were not seen directly; everything else was observed or is documented.

## 1. Window chrome (Arc)

| Item | Arc 1.170 | Source |
|---|---|---|
| Open | ⌘, (Arc menu > Settings…; shortcut row "Preferences… ⌘,"). Every pane is also reachable from the Command Bar ("Account Preferences", "Advanced Preferences", "Link Preferences", "Open Shortcuts"…) | [LIVE] [RN21] [RN22] [RN23] [ACC] |
| Window | Separate standard window. Close button active; minimise and zoom disabled | [LIVE] |
| Size | 684 × 650 pt. Panes with a scroll bar (Profiles, Max, Links) are 701 × 650: the 17 pt legacy scroller sits outside the 684 pt content | [LIVE] |
| Title | Title bar 32 pt. The title is the selected pane's name; the first pane's title is the user's first name | [LIVE] |
| Toolbar | `NSToolbar` preference style, 56 pt tall, items centred, icon above label. Item width 55 pt (Shortcuts 63, Advanced 64, account 58) | [LIVE] |
| Selected tab | Rounded-rect chip `#474746` (dark) behind icon + label; icon and label tinted system blue (≈ `#3478F6`). Unselected: light grey | [LIVE] |
| Icons | Gear (General) and stacked windows (Links) are custom 24 pt vectors (`PrefsGeneral` = icon-pref-general, `LinksPrefPaneIcon` = icon-pref-little-browser); the rest look like SF Symbols *(inferred)* | [CAR] [LIVE] |
| Font | SF Pro (system), 13 pt body; 11 pt grey section headers in sentence case (e.g. "Your Data and Settings") | [LIVE] |
| Dark colours | Title bar + toolbar `#2B2B2A`; 1 px divider under toolbar `#333232`; content `#242323`; card fill `#272626`; card border + row separators `#3A3939`–`#3C3B3B` 1 px; push-button fill `#323131`; switch on `#387AF4` (knob `#E1EBFE`), off `#3B3A3A` (knob `#E2E2E2`) | [LIVE] |
| Named colours (light / dark) | `PreferencesSectionPrimaryForegroundColor` rgba(0,0,0,.66) / `#F3F3F3`; `PreferencesButtonBackgroundColor` rgba(0,0,0,.15) / rgba(224,223,224,.07); `PreferencesButtonForegroundColor` `#5F5F5F` / `#E0DFE0`; `PreferencesLinkColor` `#458AFF` both; `PreferencesLinkBackgroundColor` `#C2D9FF` / rgba(194,217,255,.25); `PreferencesSectionHighlightBackgroundColor` `#F5E8C7` / rgba(255,255,255,.077); `PreferencesSectionHighlightTextColor` `#7D5E0F` / white; `PreferencesIconButtonBackgroundColor` `#DBDFE5` / `#515671`; `ErrorMessageForegroundColor` `#C93333` / `#FF5A5F`. Which element uses each one is *(inferred)* from the names | [CAR] |
| Cards | Radius 8 pt; inset 64 pt from the left and right window edges (card width 556 pt); 20 pt below the toolbar; rows inset 10 pt; separators inset 8 pt; toggle rows ≈ 37–41 pt | [LIVE] |
| Controls | Native AppKit: small `NSSwitch` (36 × 16), popup buttons, push buttons ending in "…" when they open something. ⓘ buttons open the matching resources.arc.net article in a Little Arc window | [LIVE] |
| Pane switch animation | Not confirmed. The window keeps 650 pt height for every pane, so there is no height resize; whether the width change (684 → 701) or the content animates was not captured | [LIVE] |
| History | Redesigned Apr 11, 2024 (v1.38): "easier to find, scan and understand". Profiles pane added Jan 18, 2024 (v1.26) | [RN24] |

## 2. Pane order (Arc toolbar, left to right)

1. **<first name>** (Account): ID card with "@"
2. **General**: gear
3. **Profiles**: person
4. **Max**: four-petal flower
5. **Links**: stacked windows
6. **Shortcuts**: keyboard
7. **Icon**: Arc "A" outline
8. **Advanced**: three sliders

Source: [LIVE]. The binary's preference view controllers match this list: Account, General, Profile, Max, Links, Shortcuts, AppIcon, Advanced (+ a Staff pane for employees only) [SRC].

## 3. Arc panes

### 3.1 Account (first name) [LIVE] unless noted

- Top banner (grey pill, centred), only when Arc is not the default browser: "Arc isn‘t your default browser." + blue button "♥ Make Arc your default".
- Left: membership card 240 × 360 pt (cream `#FFFDEC`, animated blob arch, name, title, anniversary stickers, "ARC | <join date>"). Under it three icon buttons: Share, Download, Randomise (die). Card added to Preferences in 2022, stickers Feb 22, 2024 (v1.31) [RN22] [RN24].
- Right, card 1: "Account" + email + `…` menu: Change Email…, Change Name…, Reset Password…, separator, Delete Account…. Row 2 (unverified accounts only): "Verify your email to complete account setup." + "Send Verification Email". [ACC]
- Card 2: "Sync Sidebar" switch (off). Footer: "Arc Sync is end-to-end encrypted, only you can see your data. [Learn more] or view your [Recovery Card]."
- Card 3: "Gift Arc to a Friend" + "🎁 Share Arc". Footer: "Share Arc to unlock exclusive app icons! [Click here] or in the **Icon** tab in settings for details."

### 3.2 General [LIVE] unless noted

Card 1:

| Label | Control | Default |
|---|---|---|
| Automatically update my Arc ⓘ | switch | off (installs updates on wake from sleep) [UPD] |
| Warn before quitting | switch | on *(inferred default: no override key in [DEF])* |

Card 2:

| Label | Control |
|---|---|
| Previews | button **Previews Settings…** (sheet) |
| Manage your default search engine, Auto-Archive, and downloads in Profile Settings. (2 lines) | button **Profile Settings…** (switches to Profiles) |

Previews Settings… sheet (422 × 372 pt, navy `#161C2F`, radius ≈ 20): title "Show Arc Previews:"; body "Save a click! Hover your mouse over an Arc Folder, Pinned, or Favorited tab to quickly preview what you need from that site! [Learn more]"; checkboxes, all on: Arc Folders, Google Calendar, Google Mail, Outlook Calendar, Outlook Mail, Recent pages on Linear, Notion, and Figma, Notion Calendar; button **Done ⏎** (92 × 38, `#3339F1`). Menu simplified Jun 2024 [RN24].

### 3.3 Profiles [LIVE] unless noted

Intro: "Profiles help keep your data separate across Spaces — like history, logins, cookies, and extensions. You can use any Profile across one or more Spaces. [Learn more.]"

Left: source list 205 × 445 pt, header "Your Profiles"; 40 pt rows: name + grey "N Spaces" on the right; selected row `#242934`. Bottom bar: **+**, **−** (disabled for Default, tooltip "The Default Profile cannot be deleted."), Autofill button. Renaming: not captured on macOS (Windows notes say profiles can be renamed and deleted here [WIN]).

Right, per selected profile. Card A:

| Label | Control | Options (order) | Default |
|---|---|---|---|
| Search engine | popup | Google, DuckDuckGo, Brave, Microsoft Bing, Ecosia, Perplexity | Google |
| Manage search | button **Search Settings…** | (destination not captured; probably Site Search settings *(inferred)*, cf. Command Bar "Site Search Settings" [RN23]) | |
| Include search engine suggestions | switch | | on |

Card B:

| Label | Control | Options (order) | Default |
|---|---|---|---|
| Archive tabs after ⓘ | popup | 12 hours (default), 24 hours, 7 days, 30 days | 12 hours |
| New documents | popup | ——, Confluence Page, Google Doc, Notion Page, Word Doc | —— |
| Download location | popup with folder icon | Downloads, Other…, separator, Ask every time | Downloads |

No "Never" archive option is offered, although the binary has the string "Arc will never auto-archive your tabs." [STR]. Archive timing per profile since Jan 18, 2024 [RN24].

Header "Your Data and Settings", then one card of navigation rows (24 pt coloured rounded-square icon, label, blue → on the right). They open Chromium settings for that profile [CLR] [WIN]:

1. Privacy and Security (blue `#3C7FD8`, lock)
2. Passwords (green `#5EB55D`, key)
3. Credit Cards (yellow `#D9BD43`, card)
4. Notifications (orange `#D28643`, bell)
5. Clear Browsing Data (red `#CE4C48`, trash): opens Chromium "Delete browsing data" [CLR]

### 3.4 Max [LIVE] [MAX]

- Hero 684 × 128 (blue `#343BF5` with grain, "MAX" wordmark, wavy bottom). Text: "Let Arc do more for you with Max, so you can do less. Power up your browsing with AI and spend time on the things that matter — on or off screen."
- Card 1: "Enable Max" + blue **Turn On Max**; "Automatically enable future Arc Max features" switch, off (`arcMaxAutoOptInEnabled` [DEF]).
- Card 2, each row = 88 × 56 thumbnail + title + grey description + switch (all off): Tidy Tabs (`tidyTabsEnabled`), Instant Links (`instantLinksEnabled`), 5-Second Previews, Tidy Tab Titles, Tidy Downloads, ChatGPT in the Command Bar. Ask On Page was removed Aug 2025 [RN24].
- Footer: "Max features require that we send data to our AI partners." + "Learn more about what we send".

### 3.5 Links [LIVE] unless noted

- Hero 684 × 135 (salmon `#D28485`, a Little Arc mock-up; asset `LittleArcHeroImage` 684 × 135 [CAR]). Text: "Little Arc is a smaller, simpler Arc window. It’s perfect for quick lookups and reading funny tweets your friends send you."
- Card 1 (switches, full-row labels):

| Label | Default |
|---|---|
| Open Little Arc when I press ⌥⌘N in any app | on |
| Open Little Arc when clicking on links with ⌥⌘ held | on |
| Links from other apps open in Little Arc | on |
| Archive Little Arcs after: (popup: 1 hour, 6 hours (default), 12 hours) | 6 hours [RN23] |

- Rule, then: "Peek is a way to preview a link without opening a new tab. It’s perfect for quickly looking at a link from an email, news article, or tweet."
- Card 2:

| Label | Sub-text | Default |
|---|---|---|
| Open a Peek window when clicking on links with Shift held | | on |
| Open a Peek window when clicking on links to other sites | *Note: This only affects Favorites and Pinned tabs* (italic grey) | on |

- Bottom row: "Choose where links open inside Arc. ⓘ" + **Air Traffic Control…**.
- Air Traffic Control… dialog (not captured live): **New Route**; each route: "URL" + "contains" / "is equal to" + text + destination (a Space, Most Recent Space, Little Arc); delete with (−); a **Default** popup (initially Little Arc) for links from outside Arc [ATC]. Stored as `rules[].sourceComponents[].urlMatch {contains|…, text}` and `defaultDestination` [ATC-FILE]. A default Google Meet route exists (`didSetDefaultGoogleMeetRoute` [DEF]; `meet.google.com` contains → most recent Space [ATC-FILE]).

### 3.6 Shortcuts [LIVE] unless noted

- Top banner (grey pill): "Start with the basics" + blue "⌘ Learn the Essential Shortcuts".
- Left: search field "Type a feature name or shortcut (like “Command E”)"; list 340 × 408, header "Default Shortcuts", 48 pt rows, action name left, white rounded keycap box (≈ 63 × 24) right, "---" when unset. One flat alphabetical list (full list in [LIVE]); "Minimize Window ⌘M" shows a ⚠ icon.
- Right: two big blue keycaps (⌘ and a smiley), "Custom Shortcuts", "Change shortcuts for your favorite actions, and even choose whether Arc or a website takes priority."
- Bottom: **Reset All Shortcuts** (disabled when nothing is customised) + `…` menu with **Extension Shortcuts…**.
- Per-row extras (not opened live): right-click > "Reset Shortcut to Default" [RN23]; Arc-vs-website priority per shortcut [RN22] [RN23]; "Include Favorites in ordering." on the "Go to Sidebar Item" rows [RN22] [STR]; ⌘9 = 9th or last item [RN22]; function keys can be mapped [RN22]. A `ShortcutsPane+AdditionalSettings` view exists [SRC]. Custom shortcuts are stored in `StorableKeyBindings.json` `userOverrides` [ATC-FILE dir].

### 3.7 Icon [LIVE] [DEF]

One 556 pt card holding a single-column list (not a grid): 6 rows at 81 pt pitch, each = radio (22 pt, selected = `#3339F1` fill + white ring) + 64 × 64 preview + bold 15 pt name + optional caption; inset hairlines between rows.

| # | Name | Caption |
|---|---|---|
| 1 | The Original Arc | "CURRENT ICON" (blue caps, under the selected row) |
| 2 | Candy Arc | "by Dmitry Novikov" (italic, inline) |
| 3 | Neon | |
| 4 | Fluted Glass | |
| 5 | Schoolbook | |
| 6 | Colorful | |

`availableAppIconNames` = original, candy, neon, flutedGlass, schoolbook, colorful; `currentAppIconName` = arc.original [DEF]. Referral-locked icons were not listed on this profile [LIVE] [RN24].

### 3.8 Advanced [LIVE] unless noted

Each row: 24 pt coloured rounded-square tile with a white SF Symbol, label, switch on the right.

| Card | Tile | Label | Sub-text | Default |
|---|---|---|---|---|
| 1 | blue `#3F8FF7` speaker.wave.2.fill | Play Arc sound effects | | on |
| 1 | blue hand.tap.fill | Haptic feedback when reordering tabs | | on |
| 2 | green `#68CE67` macwindow | When opening Arc, restore windows from previous session | | off |
| 2 | green rectangle.topthird.inset.filled | Allow window dragging from the top of webpages | | on |
| 2 | red `#EB534E` ellipsis.rectangle | Show full URL when Toolbar is enabled | | off |
| 2 | red quote.opening | Enable Shared Quotes when highlighting text. | If disabled, you can still copy URL as a quote using ⌃⇧⌘C. | on |
| 3 | purple `#CA43EA` play.square | Enable Picture in Picture when you leave a video tab | | on |
| 3 | purple paintpalette.fill | Allow websites to get your theme data | | on |
| 3 | purple paintbrush.fill | Enable Boosts on websites you visit | | on |

Defaults are the values on this profile; `defaults read` shows no override for them, so they are taken as Arc's defaults *(inferred)*.

Bottom buttons: **More Settings…** (opens Chromium's settings; was "Advanced Settings" in 2023 [RN23]), **Reset Translated-site Prompts**, and right-aligned **Export Data** (save panel; writes "Arc Data Export.md", one section per Space with Favorites, pinned tabs, folders and other tabs as links [EXP] [STR]).

### 3.9 Seen in Arc but not placed

- Native ad blocker: key `nativeAdBlockEnabled` = 0 [DEF]; strings "Ad Block Settings", "Advanced Ad Block Settings", "Choose an ad blocker to use for your %@ profile:" [STR]; an `AdBlockAdvancedSettingsDialog` [SRC]. Not visible in any pane on this profile; probably shown only once the native blocker is on *(inferred)*.
- No setting exists in Arc for: language, light/dark appearance, sidebar translucency, toolbar visibility (View > Show Toolbar, ⇧⌘D [RN24]), tab sleep, extensions, import (File > Import from Another Browser…), Developer Mode (automatic on localhost, per site in Site Control Center [DEV]).

## 4. Radian today

Window: `src/main/panes.js` 720 px wide, height fits the pane (260 px min, screen − 60 max, animated resize), title "Settings", translucent background (`--base` 84%). Toolbar: custom HTML tabs (`settings.html` `#tabs`), 22 px SVG icons, 11 px weight-500 labels, min width 62, selected = `--pill` fill + accent colour. Panes fade in 160 ms. Cards radius 12, rows ≥ 44 px, headers 12 px uppercase, switches 34 × 20 (`settings.css`). Last pane remembered.

Panes (10): General, Profiles, Tabs, Links, Shortcuts, Appearance, Privacy, Extensions, Import, Advanced. Controls and defaults (`src/main/store.js`) are in the mapping below.

## 5. Mapping: every Radian control to Arc

| Radian pane | Radian control (key, default) | Arc target | Action |
|---|---|---|---|
| General | Language (`lang`, en) | none | Keep, Radian-only, put in General card 1 |
| General | Default browser status + "Make Radian the default" | Account > top banner "…isn‘t your default browser." + "♥ Make … your default" | Move: banner at top of the first pane, hidden when default |
| General | Pick up where you left off when Radian opens (`restoreSession`, on) | Advanced card 2 "When opening Arc, restore windows from previous session" (off) | Move + relabel; Arc default is off |
| General | Warn before quitting (`warnOnQuit`, off) | General card 1 "Warn before quitting" (on) | Keep label; Arc default is on |
| General | Search engine (`searchEngine`, google) | Profiles card A "Search engine" | Move to Profiles; no global value in Arc |
| General | Search suggestions while typing (`suggestions`, on) | Profiles card A "Include search engine suggestions" | Move + relabel |
| General | Archive inactive tabs after (`archiveAfterHours`, 12 h; +Never) | Profiles card B "Archive tabs after ⓘ" (12 hours (default), 24 hours, 7 days, 30 days) | Move + relabel; "Never" is Radian-only (keep or drop) |
| General | "These settings can differ…" + Open Profiles | General card 2 "Manage your default search engine, Auto-Archive, and downloads in Profile Settings." + **Profile Settings…** | Relabel |
| General | Site Search list (`siteSearch`) | Profiles card A "Manage search" + **Search Settings…** | Move behind the button (sheet) *(target inferred)* |
| General | Download location (`downloadDir`) | Profiles card B "Download location" popup: Downloads, Other…, —, Ask every time | Move; becomes a popup |
| General | Always ask where to save (`downloadAsk`, off) | "Ask every time" item of that popup | Merge into the popup |
| General | Open downloaded PDFs in a tab (`downloadOpenPdf`, on) | none | Keep, Radian-only, put in Advanced card 2 |
| General | Footer "Radian is free software…" + version | none | Drop (About Radian shows it) |
| Profiles | One card per profile, editable name, Delete | Source list "Your Profiles" (name + "N Spaces"), +/− bar, detail on the right | Rebuild as list + detail; − disabled for Default |
| Profiles | Per-profile Search engine / Search suggestions / Archive / Download location, each "Same as General" | Profiles cards A and B, plain values per profile | Drop the inheritance UI |
| Profiles | Hints (`set.profilesHint`, `profilesHint2`) | Intro "Profiles help keep your data separate across Spaces…" | Replace |
| Tabs | Put a tab to sleep once hidden for (`sleepAfterHours`, 3 h) | none | Keep, Radian-only, put in Advanced (new card after Arc's three) |
| Tabs | Battery saver (`batterySaver`, on) | none | Keep, Radian-only, Advanced |
| Tabs | Memory left to tabs (`memoryBudget`, 25%) | none | Keep, Radian-only, Advanced |
| Tabs | Tabs kept in memory (`maxLiveTabs`, 30) | none | Keep, Radian-only, Advanced |
| Tabs | Other sites that stay awake (`neverSleep`) | none | Keep, Radian-only, Advanced, behind a "…" button sheet |
| Links | Open links from other apps in (`externalLinks`, little; or a Space) | Links card 1 "Links from other apps open in Little Arc" switch + ATC dialog **Default** popup | Split: switch in Links, destination in the ATC dialog |
| Links | Link routing list (kind Site is / URL contains / URL is equal to, match, destination) | Links "Choose where links open inside Arc. ⓘ" + **Air Traffic Control…** dialog (New Route, contains / is equal to, destination, Default) | Move into a dialog; "Site is" kind is Radian-only (keep) |
| Links | Peek links from pinned tabs (`peekLinks`, on) | Links card 2 "Open a Peek window when clicking on links to other sites" + italic note | Relabel |
| Links | Peek at a link with ⇧-click (`peekShift`, on) | Links card 2 "Open a Peek window when clicking on links with Shift held" | Relabel |
| Links | Little Radian with ⌥⌘-click on a link (`littleAltClick`, on) | Links card 1 "Open Little Arc when clicking on links with ⌥⌘ held" | Relabel |
| Links | Global shortcut for Little Radian + Change… (`littleKeys`) | Links card 1 switch "Open Little Arc when I press ⌥⌘N in any app"; key itself edited in Shortcuts ("New Little Arc Window ⌥⌘N") | Becomes a switch; rebinding stays in Shortcuts |
| Links | Close unused Little Radian windows after (`littleArchiveHours`, 6 h; 6h–30d, Never) | Links card 1 "Archive Little Arcs after:" (1 hour, 6 hours (default), 12 hours) | Relabel; options differ |
| Shortcuts | Search field | Same; placeholder "Type a feature name or shortcut (like “Command E”)" | Relabel placeholder |
| Shortcuts | Reset All (top) | **Reset All Shortcuts** (bottom, disabled when nothing changed) | Move + relabel |
| Shortcuts | Hint text | Right column "Custom Shortcuts" + text | Replace |
| Shortcuts | Grouped list (h3 sections, extensions, global Little Radian) | One alphabetical list, header "Default Shortcuts", 48 pt rows, keycap boxes, "---" when unset; extensions behind `…` > **Extension Shortcuts…** | Flatten; extensions to a sheet |
| Shortcuts | Include favorites in ⌘1 … ⌘9 (`tabKeysFavorites`, on) | Per-row "Include Favorites in ordering." on "Go to Sidebar Item" rows | Move to a per-row option |
| Shortcuts | ⌘9 goes to the last tab (`tabKeysNinthLast`, on) | Row "Go to last Sidebar Item ⌘9" (9th vs last choice) | Move to a per-row option |
| Shortcuts | Essential shortcuts… (footer button) | Top banner "Start with the basics" + "⌘ Learn the Essential Shortcuts" | Move + relabel |
| Appearance | Appearance Auto/Light/Dark (`appearance`, auto) | none (Arc: per-Space theme picker) | Keep, Radian-only, put in General |
| Appearance | Translucent sidebar (`translucent`, off) | none | Keep, Radian-only, put in General |
| Appearance | Show the toolbar (`showToolbar`, off) | none (View > Show Toolbar ⇧⌘D) | Drop from Settings |
| Appearance | Show full URL when the toolbar is enabled (`showFullUrl`, off) | Advanced card 2 "Show full URL when Toolbar is enabled" | Move + relabel |
| Appearance | App icon grid (7 icons) + hint | Icon pane: single-column radio list, 64 pt previews, "CURRENT ICON" caption | Move to an Icon pane, list layout; Radian's own art |
| Appearance | Space theme hint | none | Drop |
| Privacy | Block ads and trackers (`adblock`, on) | Native ad blocker, location not seen (§3.9) | Keep, Radian-only, put in Profiles card B or Advanced *(placement inferred)* |
| Privacy | Hide cookie banners (`cookieBanners`, off) | none | Keep, Radian-only, next to ad blocking |
| Privacy | Allow websites to get your theme colours (`themeData`, on) | Advanced card 3 "Allow websites to get your theme data" | Move + relabel |
| Privacy | Allow JavaScript in Boosts (`boostsJs`, off) | none (Boosts with JS enabled per device via "View Boosts" [RN24]) | Keep, Radian-only, under the Boosts row in Advanced |
| Privacy | Sites where blocking is off | none | Keep, Radian-only, sheet from the ad-block row |
| Privacy | Offer to save passwords (`passwordSave`, on), Offer saved passwords (`passwordFill`, on), Saved passwords Manage… | Profiles "Your Data and Settings" > **Passwords** row | Move behind the Passwords row |
| Privacy | Clear browsing data… | Profiles "Your Data and Settings" > **Clear Browsing Data** | Move to a row |
| Privacy | Reset site permissions ↺ | Profiles "Your Data and Settings" > **Privacy and Security** | Move behind that row *(approximate match)* |
| Extensions | Install by URL + extension list | none (no Extensions pane) | Keep, Radian-only; drop the pane only if Extensions > Add/Manage Extensions… (`menu.js` 231–232, which open this pane) get their own window |
| Import | From Arc, bookmarks HTML, destination profile, passwords CSV, installed browsers | none (File > Import from Another Browser…) | Drop the pane; keep the import flows on the menu (`menu.js` 72–74) |
| Advanced | Updates card: version, Check now, release notes, download | none (Arc menu > Check for Updates…, sidebar banner) | Move to the Check for Updates… flow |
| Advanced | Check for updates automatically (`updateCheck`, on) | General card 1 "Automatically update my Arc ⓘ" (off; installs) | Move to General card 1; keep Radian wording (Radian only checks) |
| Advanced | Picture in picture for video (`autoPip`, on) | Advanced card 3 "Enable Picture in Picture when you leave a video tab" | Relabel |
| Advanced | Mini player in the sidebar (`mediaControls`, on) | none | Keep, Radian-only, Advanced card 3 |
| Advanced | Radian sounds (`sounds`, on) | Advanced card 1 "Play Arc sound effects" | Relabel ("Play Radian sound effects") |
| Advanced | Gesture sounds (`soundGestures`, off), Sound volume (`soundVolume`, 50) | none | Keep, Radian-only, under the sounds row |
| Advanced | Haptic feedback when reordering tabs (`haptics`, on) | Advanced card 1, same label | Keep |
| Advanced | Enable Boosts on websites (`boostsEnabled`, on) | Advanced card 3 "Enable Boosts on websites you visit" | Relabel |
| Advanced | Developer mode: Automatic on local sites (`devLocalhost`, on) + site list | none (always automatic on localhost; per site in Site Control Center [DEV]) | Keep, Radian-only, Advanced last card |

## 6. Arc controls Radian lacks

- Account pane (membership card, account menu, Sync Sidebar, Gift Arc): skip, no accounts. Only its default-browser banner applies.
- General: **Previews Settings…** sheet (hover previews; ledger row 63 is Excluded, so drop).
- Profiles: source list with +/−/Autofill; **Search Settings…**; **New documents** popup (ledger row 42 Partial); **Ask every time** in the download popup; "Your Data and Settings" rows for **Credit Cards** and **Notifications**; engines Microsoft Bing and Perplexity (Radian has Bing and Qwant instead).
- Max pane: all of it (AI, ledger rows 57–62 Excluded).
- Links: hero art and intro texts (draw Radian's own art); "Archive Little Arcs after" 1 hour option; ⓘ help buttons.
- Shortcuts: top banner, right-column illustration, per-shortcut Arc-vs-website priority (ledger row 51 gap).
- Icon: list layout with radio buttons and captions.
- Advanced: **Allow window dragging from the top of webpages**; **Enable Shared Quotes when highlighting text.** (ledger row 46 Partial); **More Settings…**; **Reset Translated-site Prompts** (drop: no Chrome translate in Electron); **Export Data**.
- Chrome: fixed 684 × 650 window, pane name as window title, 8 pt cards inset 64 pt, native-size switches, 11 pt sentence-case section headers, coloured icon tiles in Advanced and in "Your Data and Settings".

## 7. Not confirmed

- Pane switch animation and the light-mode look of each pane (live capture was dark mode only; §1 gives the light named colours).
- Where **Search Settings…**, **More Settings…** and the five "Your Data and Settings" rows lead, and the Air Traffic Control dialog's exact layout (web description only).
- How a profile is renamed on macOS.
- Where the native ad-blocker settings appear.
- That the observed switch values are Arc's factory defaults (inferred from `defaults read` showing no override).

## Sources

- [LIVE] `docs/parity/captures/live/settings.md`: Arc 1.170.0 AX tree + screenshots, 2026-10-23, dark mode.
- [DEF] `defaults read company.thebrowser.Browser` on this Mac.
- [ATC-FILE] `~/Library/Application Support/Arc/StorableLinkRouting.json` and `StorableKeyBindings.json` (read-only).
- [CAR] `assetutil --info` of `/Applications/Arc.app/Contents/Resources/ARC_PreferencesFeature.bundle/Contents/Resources/Assets.car` (asset names and colour values only).
- [SRC] `PreferencesFeature/*.swift` file names embedded in the Arc binary (targeted `strings | grep`).
- [STR] targeted `strings /Applications/Arc.app/Contents/MacOS/Arc | grep` to confirm label wording.
- [RN24] https://resources.arc.net/hc/en-us/articles/20498293324823 (read via the help-center API)
- [RN23] https://resources.arc.net/hc/en-us/articles/20498377604887
- [RN22] https://resources.arc.net/hc/en-us/articles/20498417809815
- [RN21] https://resources.arc.net/hc/en-us/articles/20498463803799
- [WIN] https://resources.arc.net/hc/en-us/articles/22513842649623
- [EXP] https://resources.arc.net/hc/en-us/articles/25583851606039
- [CLR] https://resources.arc.net/hc/en-us/articles/25614376281751
- [UPD] https://resources.arc.net/hc/en-us/articles/21489650267031
- [ACC] https://resources.arc.net/hc/en-us/articles/19401542261911
- [MAX] https://web.archive.org/web/20250908064722/https://resources.arc.net/hc/en-us/articles/19335160678679
- [DEV] https://web.archive.org/web/20251008223739/https://resources.arc.net/hc/en-us/articles/20468488031511
- [ATC] https://allthings.how/how-to-route-links-to-specific-arc-spaces-using-air-traffic-control-in-the-arc-browser/
