# Arc 1.170 vs Radian: remaining look, motion and feel gaps

Researched 2026-10-23 from public sources and static reading of Radian's code. Nothing was launched. This file only lists what `visual-spec.md`, `web-research.md`, `captures/*/spec.md` and the Gap column of `status.md` do not already settle; gaps already in `status.md` (squircle card corner, "↓ Clear" arrow, bold Space title when Pinned is collapsed, music-note badge) are not repeated.

**Method.**
- Arc's release notes were read in full through the help center's public API (`resources.arc.net/api/v2/help_center/en-us/articles/<id>.json`; the HTML pages sit behind a Cloudflare check). Every note was searched for animation, look and performance wording.
- arc.net's own Arc replica CSS was re-read for anything new.
- Arc toast wording was checked with a targeted `strings … | grep` on the Arc binary.
- Arc's preference keys were listed with `defaults read company.thebrowser.Browser`.
- Reddit, forums, Figma Community and YouTube turned up no new numbers: no public source gives Arc timings or sizes beyond what is already recorded.

**Confidence.**
- **high**: documented by The Browser Company (TBC), or measured in Arc 1.170 by an earlier round.
- **medium**: documented, but the exact look has to be inferred.
- **low**: inferred from indirect evidence; check it live before relying on it.

## Fixable gaps, most noticeable first

| # | What | Arc (value · source · confidence) | Radian now (file:line) | Suggested change |
|---|---|---|---|---|
| 1 | Sidebar text weight | Arc's sidebar is AppKit text. The earlier round found that only `-webkit-font-smoothing: subpixel-antialiased` gives the Command Bar text Arc's stroke thickness · `overlay.css:47-48`, layout/spec.md fits (CoreText `NSFont.systemFont`) · medium | Every UI page, the sidebar included, uses `-webkit-font-smoothing: antialiased`, which renders thinner strokes than AppKit (`src/renderer/base.css:93`). Only the Command Bar overrides it (`overlay.css:48`) | Drop `antialiased` from `base.css:93` (or set `subpixel-antialiased` on `body` in `shell.css`). Then compare tab-title ink width with the 14 pt Regular fit in layout/spec.md |
| 2 | Extra loading shimmer in the URL pill | Since Feb 2023 the loading progress shows "at the top center of the Arc window". This replaced the 2021 address-bar indicator · [RN23], [RN21] · medium | A highlight sweeps across the URL pill on every load (`shell.css:161-165`, toggled at `shell.js:378`) **in addition to** the top glow | Delete the `#url::after` sweep and the `loading` class toggle on `#url` |
| 3 | Loading glow does not show progress | The module is named `GlowProgressLoadingIndicator` (a Metal shader). The note says "to see the loading progress of your webpage… top center" · [RN23], bundle name · medium (the exact shape is unmeasured) | A fixed-width blob breathes on a 1.4 s loop, unrelated to progress (`shell.css:168-176`; `body.loading` at `shell.js:380`) | Drive the blob's `scaleX` (or its width) from a progress value. Electron has no load-progress event, so step it: `did-start-loading` → 0.15, `dom-ready` → 0.6, `did-stop-loading` → 1, then fade. Measure the real shape live (see below) |
| 4 | Scrollbars on internal pages | Arc's Library and Settings are native panels with macOS overlay scrollers that fade when idle. TBC fixed "the appearance of scroll bars in the Library Space Manager" · [RN23] · medium-high | Every page that loads `base.css` (Library, Settings, Notes, Shortcuts, Passwords…) forces an always-visible 8 px custom scrollbar (`base.css:134-135`; again in `settings.css:102-104`) | Delete those rules so Chromium draws macOS overlay scrollbars, which follow System Settings. Keep the `width: 0` rules that hide bars on purpose |
| 5 | CPU-heavy background tabs are destroyed, not paused | macOS: "Background tabs that use a lot of CPU will now automatically be paused". Windows: "We now automatically freeze background tabs that use too much CPU" · [RN24], [WIN-RN] · high | The CPU rule puts the tab to sleep, which destroys the page. It reloads on return and loses scroll and video position (`veille.js:88-120`, `window.js:1556-1558` `sleepView`) | Freeze instead: `wc.debugger.sendCommand('Page.setWebLifecycleState', { state: 'frozen' })`, then `'active'` when the tab is shown. Skip tabs whose debugger is already attached (DevTools, `unload.js` shield). Keep discarding for the count, idle and memory rules |
| 6 | "+ New Tab" shortcut hint | Hovering the row shows "⌘T" at its right end · web-research §2.5 (TBC onboarding clip) · high | No inline hint; a tooltip appears after 500 ms instead (`shell.html:95` `data-tip`, `shell.js:1923` `TIP_DELAY`) | Add a right-aligned dim `<kbd>` span to `#b-newtab`, shown on `:hover`, and drop its `data-tip` |
| 7 | Recent Tab Indicator | "You'll see a slight highlight on your last tab's favicon so you can jump to it quickly" (Ctrl+Tab target) · [RN23] · high that it exists, look unmeasured | None: no marker on the previous tab (no match for recent/last tab in `shell.js` or `shell.css`) | Add a class to the previous tab's row and draw a faint accent ring or glow on `.ic`. Confirm the look live |
| 8 | Secondary text and icon alphas (dark theme) | Measured white alphas: "New Tab" label 0.45; its "+" 0.50; URL text 0.60; toolbar and bottom-bar icons 0.59; active Space icon 0.49; inactive Space dot ≈0.25 (est); empty-Favorites body 0.63 · colors/spec.md · high | All of these use `--dim` (0.55, `theme.js:155`): "New Tab" 0.55 and "+" ≈0.46 (`shell.css:352-353`), URL 0.55 (`:157`), icons 0.55 (`:69`), active Space 0.55 (`:515`), dot 0.18 (`:502`), Favorites body 0.55 (`:243`) | Set each colour to its measured alpha with `color-mix` on `--fg`/ink, or add a 0.45 and a 0.60 step to the palette in `theme.js`. The "New Tab" text and "+" values are currently swapped in effect |
| 9 | Toast wording | Arc's strings: "Copied Current URL", "New Tab Created in %@", "Tab moved! Click to go there.", "Battery Saver Mode Activated" / "Battery Saver Mode Deactivated". Arc also has "Copied a clean link without trackers" and "Copied clean links without trackers" (which action shows these is unverified). Battery Saver "will turn off automatically once battery is back over 20%" · Arc binary strings, [RN23] · high | "Copied URL" (`locales.js:1724`), "New tab created in {space}" (`:1641`), "Tab moved to {space}! Click to go there." (`:1465`), one Battery Saver toast "Low battery: hidden tabs go to sleep sooner" (`:2278`, sent at `window.js:1493`), and no toast when Battery Saver turns off | Use Arc's wording in `en` (and the matching `fr`), and add a "Deactivated" toast when `veille.saving` flips back to false |
| 10 | Memory release follows Radian's own budget, not system memory | "Proactive memory release when we find the system has limited available memory" · [RN24] · medium (no threshold published) | Tabs sleep once tab processes pass 25% of RAM, whether or not the Mac is short of memory (`store.js:36` `memoryBudget`, `veille.js:73-79`, `:84-86`). Nothing reacts to pressure from other apps | Also trigger rule 3 when `process.getSystemMemoryInfo()` reports low free memory (for example under 10% of total), and keep the 25% as a ceiling |
| 11 | App Nap | Arc sets `NSAppSleepDisabled = 1` · `defaults read company.thebrowser.Browser` · high (observed); its effect on feel is small | Not set: `defaults read com.radian.browser NSAppSleepDisabled` has no such key, and the source never sets it | `systemPreferences.setUserDefault('NSAppSleepDisabled', 'boolean', true)` at startup. Trade-off: a little more background energy, for timers that are not delayed when the window is hidden |
| 12 | Polling while the sidebar is hidden | Arc's value is unknown. A native app would use an event-driven tracking area (inferred) · low | Polls the cursor every 16 ms (60 wake-ups a second) while the sidebar is hidden and the window has focus (`window.js:1019`, `pollPeek` `:1052-1061`) | Poll every 33 ms (reveal latency stays under 2 frames), or place a 5 pt transparent view on the left edge and react to `mouseenter` |

## Needs a live Arc capture

None of these has a public value. Record them at 60 fps (120 fps where the display allows) in Arc 1.170, dark and light, at 1× and 2×.

### Motion

- **Tab switch** (click, and ⌥⌘↓):
  - Does the selected fill jump, cross-fade or slide, and how long does it take?
  - Does the page swap on the same frame?
  - Radian: on click the new fill appears at once and the old one fades out over 150 ms; with the keyboard both fade over 150 ms (`shell.css:311-317`).
- **New tab row in, archived row out (⌘W), and the neighbours' slide:** duration, curve, scale or fade.
  - Radian: scale 0.94 + fade in over 120 ms (snappy spring); out over 150 ms; neighbours slide with the 120 ms spring (`shell.css:780-783`, `shell.js:238`).
- **Clear Today (⌘⇧K):** stagger per row and duration. Radian: 22 ms stagger, 150 ms (`shell.js:238`).
- **Peek open, close and expand:**
  - start rectangle, duration and curve
  - backdrop: dim, blur or whitening (one Orion forum post calls it "whitening")
  - insets, corner radius, button column position
  - Radian: 200 / 150 / 220 ms; 42% black backdrop; side margin 7% (44–90 pt); top 16 pt; radius 12 (`motion.js:11`, `overlay.css:337-349`, `window.js:3238-3242`, `:3296`).
- **Toast:**
  - in and out motion, time on screen
  - size, padding, font, fill (accent, or a theme surface?), whether a Share button is present
  - Radian: accent fill, 13 px / 500, radius 10, bouncy spring in, 1.9 s stay, 180 ms out (`overlay.css:310-334`, `window.js:4081`).
- **"+" and close-button animations (2022), and the back, forward and reload button animations:** what moves, and for how long. Radian: rotate 90° on hover, 3 px nudge on press, a 520 ms reload spin, buttons scale to 0.9 (`shell.css:72-86`).
- **Row press:** does Arc scale the row? Radian scales it to 0.985 (`shell.css:316`).
- **Hover fill:** fade in and out times. Radian: in at once, out over 150 ms (`shell.css:311-314`).
- **Hover-reveal:** edge hot-zone width and delay. Radian: −2 to 5 pt, next 16 ms poll (`window.js:1059`).
- **Ctrl+Tab switcher:** open and close motion, tile look (thumbnails or favicons). Radian: scale 0.96 + fade on a spring, with thumbnails (`overlay.css:123-147`, `:387-390`).
- **Theme picker and Space-creation popovers:** open motion. Radian: translateY 8 + scale 0.97 spring (`overlay.css:152-154`).
- **Loading glow:**
  - shape, width against progress, colour, blur
  - how it finishes and fades
  - whether it sits in the 10 pt top margin or over the page
- **Tooltip:** delay, fade and look. Radian: 500 ms delay, dark pill, 11.5 px (`shell.js:1923`, `shell.css:457`).
- **Sidebar overscroll rubber band:** distance and return time. Radian draws its own (max 72 px, 360 ms; `shell.js:1288`).

### Look

- **Loading tab row:** does Arc swap the favicon for a spinner? Radian does (`shell.js:35-38`, `shell.css:400-408`). TBC moved all loading feedback to the address bar (2021), then to the top-centre glow (2023), which suggests the rows show none (low).
- **Asleep tab titles:** are unloaded (asleep) tab titles dimmed? Radian dims them to `--secondary` (`shell.css:326`).
- **Favicon in a tab row:** ink size inside the 18 pt frame, and any corner rounding. Radian: 16 px with a 4 px radius (`base.css:117`).
- **Close (×) and unpin (−) buttons:** size, radius, hover fill, glyph size. Radian: 22×22, radius 6, 16 px glyph (`shell.css:327-339`, `:357`).
- **Favorites grid** (use a test profile with favourites):
  - tile height, radius, gap, fill, icon size
  - columns for 1 to 12 tiles
  - Radian: 45 px tall, radius 10, gap 8, white 10% fill, 20 px icons, up to 4 columns (`shell.css:227-261`, `shell.js:418`).
- **Light theme:** every fill and text alpha, and the selected-row shadow. Also the Command Bar's light colours, which Radian guesses (`overlay.css:25-36`).
- **Link status pill:** height, font, fill and radius. Radian: 26 tall, 11.5 px, accent 22% over dark grey (`overlay.css:357`, `window.js:347`).
- **Split View:** gap between panes, and the focused-pane outline's width and colour. Radian: 8 pt gap, 2 px ring at 70% accent (`window.js:25`, `shell.css:744`).
- **Card shadow:** the extra darkening left of the card when the sidebar is shown (≈12% at 8 pt, est. in layout/spec.md). Radian's shadow is symmetric (`shell.css:678`).
- **Sidebar scrollbar:** does a scroller show while scrolling? Radian hides it (`shell.css:199`).
- **Context menus:** do Arc's sidebar menus show item icons? Arc ships a `ContextMenus` asset catalogue.

### Performance

- Does Arc unload hidden tabs on a timer at all, and after how long? Radian uses 3 h (`store.js:35`). Watch Arc's Task Manager over a few hours.
- What Battery Saver Mode changes in Arc beyond the toast.
- Frame pacing of the sidebar slide and the Space swipe on a 120 Hz ProMotion display.

## Check on Radian (no Arc needed)

- **Tab-title ink width:** Radian's 14 px tab-title ink width against the 14 pt Regular fit. CoreText applies SF Pro's size-specific tracking; Chromium may not.
- **Window corner radius:** on macOS 26, Arc measures about 17 pt. Radian should match with `titleBarStyle: 'hidden'` and no toolbar.

## Already matched (no action)

- **Sidebar:** hide and show timings, the floating reveal and its 5 pt inset (`motion.js:11`, `base.css:26-31`).
- **Space switching:** click and swipe springs and the tint cross-fade (`shell.js:897-922`).
- **Command Bar:** opens and closes in one frame (`overlay.css:18-49`).
- **Split drop preview:** opens in 200 ms (`overlay.css:395`).
- **Frame and rows:** card inset, shadow and radius, plus row pitch, fill heights, radius and fonts for tab, folder, Space title and URL.
- **Divider and bottom bar:** the divider, the bottom bar, and the traffic lights (`window.js:33`).
- **Window resize:** the page's own background colour fills the area being revealed (`window.js:1268`), as Arc's 2024 note says.
- **Toasts and status pill:**
  - the "New Tab Created" toast is clickable when the sidebar is hidden (`window.js:1595`)
  - the link status pill dodges the pointer and shows the full URL after 1.5 s (`window.js:347`)
- **Battery Saver threshold:** 20% (`veille.js:43`).
- **GPU:** Arc sets `NSSupportsAutomaticGraphicsSwitching = true` and prefers the integrated GPU. Electron's own Info.plist carries the same key (not re-checked here: no local Electron copy).

## Sources

- [RN21] Arc for macOS 2021 release notes: https://resources.arc.net/hc/en-us/articles/20498463803799
- [RN23] Arc for macOS 2023 release notes: https://resources.arc.net/hc/en-us/articles/20498377604887. It includes:
  - "A New Loading Indicator! … top center of the Arc window"
  - Battery Saver Mode
  - Recent Tab Indicator
  - "Smarter loading for Favorites"
  - the Library scroll-bar fix
- [RN24] Arc for macOS 2024–2026 release notes: https://resources.arc.net/hc/en-us/articles/20498293324823. It includes:
  - "Background tabs that use a lot of CPU will now automatically be paused"
  - "Proactive memory release…"
  - Metal rendering of tabs
  - window resizing with the site's background colour
- [WIN-RN] Arc for Windows release notes: https://resources.arc.net/hc/en-us/articles/22513842649623. It includes:
  - "automatically freeze background tabs that use too much CPU"
  - "tab freezing and discarding"
  - the "New Tab Created" toast with a button
- Help-center API used to read the notes: `https://resources.arc.net/api/v2/help_center/en-us/articles/<id>.json`
- arc.net replica CSS: https://arc.net/_next/static/css/7627201d979738b0.css. It added only the "+ New Tab" glyph (14 px, stroke 1.6) and the footer icons (15 px at 50% black) to what web-research.md §2.1 already holds.
- Local, allowed by the agent rules:
  - `defaults read company.thebrowser.Browser` (`NSAppSleepDisabled = 1`)
  - `plutil -p /Applications/Arc.app/Contents/Info.plist` (`NSSupportsAutomaticGraphicsSwitching`)
  - Arc's resource bundle names (`ARC_GlowProgressLoadingIndicator.bundle`, `ARC_ContextMenus.bundle`)
  - `strings /Applications/Arc.app/Contents/MacOS/Arc | grep -E '^Copied|New Tab Created|Battery Saver Mode|Tab moved'`
- Toast placement: https://orionfeedback.org/d/7732-would-love-toasts-for-actions-like-copy-url-shift-c
- Peek "whitening": https://orionfeedback.org/d/4610-open-different-domains-in-popup-similar-to-arcs-peek (search snippet only; the page did not load)
