# Radian — plan

Radian is a macOS browser that an Arc user can switch to without noticing a difference, apart from the name, logo, icons and sounds. Same layout, features, shortcuts, menus, themes and animations. It's just a browser: no AI features and no accounts or sync for now.

This file is the hand-off for a new session. Read it top to bottom before writing code.

## Decisions (final)

| Topic | Decision |
|---|---|
| Engine | **Electron** (Chromium inside, prebuilt). No Chromium compile. |
| DRM build | **castLabs ECS** (Electron with Widevine) for Netflix, Disney+, Spotify web. Free signing via castLabs EVS. |
| Starting code | **Fork Orbe** ([amadoubaui/orbe](https://github.com/amadoubaui/orbe), MIT, Electron Arc clone, 292 commits, v0.15.5). |
| Platform | macOS, Apple Silicon, first. |
| Look and feel | 1:1 with Arc: layout, spacing, type, colours, menus, shortcuts and **animations** (measured frame by frame from real Arc). |
| Not copied | Arc's code, icons, images, sounds, Lottie files, name. We draw our own lookalike icons and keep Orbe's original sounds or make our own. |
| Out of scope for now | Accounts, sync, AI features, Windows. |

### Why not the other engines (settled, don't reopen)

- **Compiling Chromium** (how Arc, Stedding and Mori are built) needs full Xcode, about 150 GB free and multi-hour builds. This Mac has 17 GB free. Full research: [reports/Arc clone browser build paths.md](reports/Arc%20clone%20browser%20build%20paths.md).
- **CEF**: on macOS, putting a CEF browser inside our own window forces its "Alloy" mode, which has no Chrome extensions (stated in CEF's `cef_types_mac.h`). Mori tried CEF and abandoned it in June 2026.
- **WebKit (Swift + WKWebView, e.g. Nook)**: native, but Safari's engine. Sites behave differently, extension support is weaker, there are no iCloud passkeys, and the best base (Nook) is GPL-3.
- **Firefox/Gecko (Zen)**: needs 30 GB+ to build, no Netflix, Firefox add-ons only.

## What Orbe already has (its own claims, to be verified in Phase 1)

Sidebar with favorites, pinned tabs, folders and today tabs; drag and drop; hide with ⌘S and reveal on hover. Spaces with per-space icon, theme and profile; ⌃1–9, ⌥⌘←/→ and two-finger swipe. Gradient theme editor with 1–3 colours and grain textures. Command bar (⌘T/⌘L). Split view up to 4 panes (⌃⇧=). Peek. Little window (⌥⌘N). Incognito. Archive with ⌘W, ⇧⌘T and 12 h auto-archive. Library (history, archive, downloads). Boosts with zap. Easels. Notes. Mini media player and PiP. Built-in ad and tracker blocker. Its own password manager, encrypted with the Mac keychain. Chrome Web Store extension installs, tested with Dark Reader, Wappalyzer, uBlock Origin Lite, CSS Peeper and GoFullPage. Arc import covering spaces, pins, folders, favorites, profiles, history, passwords and logins. Find in page, zoom, capture, print, dev tools, site permissions, tab sleep. Self-tests (`npm test`, `test:ui`, `test:ext`).

Things to know about Orbe's code:

- Its UI and code are **French**: file names, identifiers, comments, strings and docs. We switch the default language to English. We rename identifiers to English only when we touch a file anyway, never as a bulk refactor.
- It pins Electron `44.7.0` and its DRM build `44.5.1+wvcus` (castLabs) in `package.json` under `"orbe"`. Scripts download Electron themselves, so there are no npm dependencies.
- Its layout: `src/main` (61 files), `src/renderer` (47), `src/preload`, `src/shared`, `scripts/` (build, dev, `make-springs.js`, `mesures.js`, `make-sounds.js`), `tests/`, `docs/` (including `analyse-arc.md`, `extensions.md`, `mots-de-passe.md`, `securite-navigation.md`, `feuille-de-route.md`).
- It was built in about two weeks by one developer, probably with an AI agent. Treat quality as unknown until Phase 1 says otherwise.

## Electron's known gaps and our workaround for each

| # | Gap | Workaround | Can it be identical to Arc? |
|---|---|---|---|
| 1 | Google can block sign-in in embedded browsers ("This browser or app may not be secure") | Present as plain Chrome: strip `Electron/` and `Radian/` from the user agent and make the `Sec-CH-UA` client hints match. If still blocked, send a Firefox UA to `accounts.google.com` only (Min's approach). | Yes, if Google accepts it. **Gate test in Phase 1.** |
| 2 | Stock Electron has no Widevine (Netflix etc.) | castLabs ECS + free EVS signing (on macOS, sign with EVS before Apple codesign). Lags Chrome by a few weeks. | Yes. Netflix caps Chrome on Mac at 1080p, same as Arc. |
| 3 | Partial Chrome extension APIs | Fill the gaps ourselves: `chrome.commands` (extension shortcuts), the Bitwarden polyfill, native messaging (1Password desktop unlock, Apple's iCloud Passwords extension). Keep an automated test of the top ~20 extensions and only upgrade Electron when they pass. | Mostly. A rare extension may still fail. |
| 4 | Passkeys | Touch ID passkeys (Electron 41.5+) and passkeys in 1Password or Bitwarden work. iCloud Keychain passkeys on any site need Apple's browser passkey entitlement: apply; Apple may refuse (it refused Nook). | Yes, unless Apple refuses. |
| 5 | No built-in password manager, no macOS Password AutoFill | Orbe's own manager, restyled to look like Arc's save/fill popups. One-click import of Arc's saved passwords (keychain prompt for "Arc Safe Storage"). Try Apple's iCloud Passwords Chrome extension once native messaging works. | Yes. |
| 6 | No Google Safe Browsing | Safe Browsing Update API (free for non-commercial use; Radian is free) with a Chrome-style red warning page. | Yes. |
| 7 | Security patches | Auto-updater plus a routine to move to every new Electron/ECS release quickly. | n/a |
| 8 | Tabs can't be discarded natively | Arc-style sleep: destroy idle tabs' web views, keep a snapshot image and the URL, restore on click. | Yes. |
| 9 | Chrome-provided UI that Arc got for free | Rebuild each one to Arc's look: save-password bubble, autofill dropdown, permission prompts, red warning page, extensions menu and popups, downloads popup, find bar, site info / "control center", right-click menus (use native `Menu`). | Yes. |
| 10 | Printing uses the standard Mac print dialog, not Chrome's print preview | Accept. | Small visible difference. |
| 11 | Translate | Build our own translate bar or rely on an extension. | Yes if built. |
| 12 | Cast to TV | None. | Missing (minor). |
| 13 | Distribution to other people | Apple Developer account ($99/yr) for signing and notarization; until then the app runs locally unsigned. | n/a |

## What we already know about Arc (collected 2026-10-22)

- **Feature ledger**: [parity/features.md](parity/features.md) lists 78 features from public docs and release notes (30 P0 = noticed on day one, 23 P1, 25 P2), with triggers, defaults, edge cases and sources. Removed Arc features are listed separately; don't build those.
- **Visual spec**: [parity/visual-spec.md](parity/visual-spec.md). No public source gives exact pixel sizes or animation timings; the file ends with a list of things to measure in the real app.
- **Menus and layout**: [parity/menus.md](parity/menus.md) has every menu item from Arc 1.170.0's menu bar, measured window layout, Arc's module list and its AppleScript dictionary.
  - Sidebar is 228 pt from the window edge to the page. The page card is inset 10 pt top, right and bottom, with about an 8 pt corner radius.
  - Traffic-light close button frame is at (12,16). The toolbar row has 32×32 buttons at y=8: sidebar toggle at x=77, back at 122, forward at 156, reload at 190.
  - URL field: x 8–220, y 46–82.
- **Arc's structure**: a Swift app (`Arc.app/Contents/MacOS/Arc`, 158 MB) on top of `ArcCore.framework` (Chromium, 591 MB), plus Firebase (sync), Sparkle (updates), Lottie (animations) and Sentry (crash reports).
- **Arc's data on this Mac** (for the importer; Orbe already reads these):
  - `~/Library/Application Support/Arc/StorableSidebar.json` holds spaces, pinned and unpinned containers, favorites, folders and split views.
    - `sidebar.containers[1]` has `items`, `spaces` and `topAppsContainerIDs`. All three are flat lists alternating `[id, object, id, object, …]`.
    - Item kinds live under `data`: `tab` (`savedTitle`, `savedURL`, `savedMuteStatus`, `timeLastActiveAt`), `list` (folder), `itemContainer`, `splitView` (`itemWidthFactors`, `layoutOrientation`), `welcomeToArc`. Items link through `parentID` and `childrenIds`.
    - Spaces have `containerIDs` as `["pinned", id, "unpinned", id]`, `customInfo.iconType`, and `profile`.
  - Other files: `StorableKeyBindings.json`, `StorableWindows.json`, `StorableArchive.json`, `StorableLinkRouting.json` (Air Traffic Control).
  - `~/Library/Application Support/Arc/User Data/` is a standard Chromium profile (History, Login Data, Cookies, Extensions). Passwords and cookies are encrypted with the keychain item "Arc Safe Storage".
- **Arc's AppleScript dictionary** (`Arc.app/Contents/Resources/Arc.sdef`) is used by Raycast and Alfred. Matching it lets those tools work with Radian. It needs a small native module, because Electron can't load an `.sdef` on its own. P2.
- **Deadline**: Arc announced its shutdown on 2026-10-22 and stops working on **2026-12-22**. Every measurement of real Arc has to happen before then.

## Rules

1. **Behaviour comes from observation, never from Arc's code.** Watching Arc run, reading our own data files and reading public docs are all fine. Don't decompile or disassemble Arc's binaries, and don't extract Arc's images, sounds, Lottie animations or other assets.
2. **Match Arc's motion by measurement.** Record Arc, measure durations, distances and curves frame by frame, then reproduce them in CSS/JS springs. Don't eyeball it.
3. **Keep Orbe's MIT license notice** (copyright Amadou Ba / PIXEWORK) in `LICENSE` alongside ours.
4. **Every feature is checked against real Arc** before it's marked done in the ledger.
5. Follow the global CLAUDE.md: small commits on a feature branch, never commit to `main`, ask before pushing.

## How REA is used

REA (the reverse-engineer-anything MCP server) is the observation toolkit. Use it on Arc for:

- **UI structure and screenshots per interaction**: `observe_native_ui` and `capture_native_ui_scenario` give the accessibility tree plus screenshots before and after each step (click, scroll, wait). They need **Accessibility** and **Screen Recording** permission for the Claude app: System Settings → Privacy & Security. `osascript` was denied Accessibility on 2026-10-22, so grant it first.
- **Our own data formats**: `inspect_sqlite_database` (Arc's History / Login Data schema for the importer) and `inspect_plist`.
- **Comparing Radian to Arc**: the same scenario run in both apps, screenshots diffed. Use Orbe's `scripts/mesures.js` and `tests/` as the starting harness.
- **Not for**: decompiling Arc (`analyze_function`, `batch_decompile`, `procedure_pseudo_code` and friends are off limits for Arc's binaries), and not for extracting assets (`inspect_asset_catalog` is metadata only).

Other capture tools:

- The computer-use MCP can read Arc's menus (`app_menu`) and take window screenshots (`app_screenshot`, `app_zoom`) at "read" tier without any extra permission. This is how `parity/menus.md` was made.
- For animation timing, record the screen (`screencapture -v`) and step through frames with `ffmpeg`. Install ffmpeg only if needed; it's about 100 MB.

## Phases

Each phase ends with its check passing and a commit.

### Phase 0 — Bring Orbe in
1. Branch `orbe-import`. Add Orbe as the `upstream` remote and merge its history (`git merge --allow-unrelated-histories upstream/main`), so its future fixes can be pulled later.
2. Keep `PLAN.md`, `parity/`, `reports/` and `research_notes/`; resolve any `.gitignore` conflict by merging both lists.
3. Rename Orbe → Radian everywhere a user can see it: app name, bundle id `com.radian.browser`, user-data folder, menus, About window, window titles. Default language English.
4. Check: `npm start` opens Radian in English, and `npm test` passes.

### Phase 1 — Gate tests (decide whether Electron is good enough)
Run on the DRM build (castLabs), since that's what ships:

1. **Google sign-in**: log into accounts.google.com, then Gmail and YouTube. Then "Sign in with Google" on x.com and one more site. Apply the UA and client-hint fix from gap #1 if blocked.
2. **Extensions**: install from the Chrome Web Store and confirm each works on a real page: 1Password, Bitwarden, uBlock Origin Lite, Dark Reader, Grammarly, Vimium, React DevTools, Honey or a similar shopping one, Google Translate, Raindrop or a similar bookmark one.
3. **DRM**: play Netflix, Disney+ and Spotify web.
4. **Arc import**: import this Mac's Arc data and compare spaces, pins, folders, favorites, history and passwords one to one.
5. **Passkeys**: create and use a Touch ID passkey on a demo site (webauthn.io).

Write the results to `parity/gate-results.md`. If Google sign-in can't be made to work, stop and rethink before Phase 2.

### Phase 2 — Audit Orbe against Arc
Walk through all 78 features in `parity/features.md` in both apps. Add a status column (done / partial / missing / differs) and a note for each. P0 rows come first.

### Phase 3 — Capture Arc (before 2026-12-22)
For every P0 and P1 feature, record:

- screenshots at the default window size (1280×800) in light and dark themes, including hover and pressed states;
- exact measurements: sizes, paddings, radii, font sizes and weights, colours and opacities;
- screen recordings of every animation, with the duration and curve measured frame by frame. At minimum:
  - sidebar hide/show and hover reveal;
  - space switch (swipe and shortcut);
  - tab open, close and reorder;
  - pin/unpin;
  - folder open/close;
  - command bar open/close;
  - Little Arc pop-in and "open in Arc";
  - Peek open/expand;
  - split view create/resize;
  - archive and restore;
  - favorite add;
  - theme change;
  - loading glow.

Store under `parity/captures/<feature>/` (images, plus a `spec.md` with the numbers). Commit the specs; keep large videos out of git (`.gitignore`).

### Phase 4 — Visual parity
Design tokens first (spacing, radii, type scale, colours, shadows, theme gradient and grain), then each surface: sidebar, URL row, favorites grid, tab rows, folders, bottom bar, page card, command bar, menus, settings, Library, Little Arc window, Peek, split view, and the rebuilt Chrome popups from gap #9. Check: screenshot diff against Phase 3 captures, scenario by scenario.

### Phase 5 — Motion parity
Rebuild every animation from Phase 3's numbers (Orbe already has `scripts/make-springs.js`). Check: side-by-side frame comparison against Arc recordings.

### Phase 6 — Feature gaps
Everything Phase 2 marked partial, missing or differs, in P0 → P1 → P2 order. This includes Arc's exact keyboard shortcuts and menu items from `parity/menus.md`, and the AppleScript dictionary (P2).

### Phase 7 — Engine work from the gaps table
Extension API gaps (#3), native messaging, Safe Browsing (#6), tab sleep (#8), passkey entitlement application (#4), auto-updater (#7).

### Phase 8 — Performance
Measure memory and battery against Arc with the same tabs open, using `powermetrics` and Activity Monitor. Target: equal to or better than Arc.

### Phase 9 — Ship
Own app icon. Signing and notarization once the Apple Developer account exists. EVS signing for Widevine. DMG, auto-update feed, and the "Set as default browser" flow.

## Open items for the owner

- Apple Developer account ($99/yr): needed before giving Radian to anyone else, and for the passkey entitlement application.
- Logo and app icon: coming later.
- Safe Browsing API key (free Google Cloud project).

## Files in this repo

- `PLAN.md`: this plan.
- `parity/features.md`, `parity/visual-spec.md`, `parity/menus.md`: what Arc is and does.
- `reports/Arc clone browser build paths.md` and `research_notes/Arc clone browser build paths/`: the engine research behind the decisions above.
- No app code yet; Phase 0 brings in Orbe's.
