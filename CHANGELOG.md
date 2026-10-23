# Changelog

All notable changes to Radian are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and Radian aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Radian's first release is 0.16.0; its version number carries on from Orbe 0.15.5.

## [Unreleased]

## [0.17.0] - 2026-10-23

Measured against Arc 1.170 again, this time live: Settings, the theme editor,
Developer Mode, the Library, the sidebar, Little Arc, Peek and motion were
captured from the running app and rebuilt to match.

### Added

- Radian speaks Spanish, Portuguese (Brazil), German, Dutch and Italian. A new
  install picks the Mac's language; Settings > General and the welcome page
  switch it.
- Drag files and folders from the Finder into the sidebar: each opens as a tab
  where you drop it.
- Hold a dragged tab on another tab in the sidebar, then drop it, to open both
  in Split View, on the side you dropped it.
- Trackpad taps when a drag is dropped and when a back or forward swipe goes
  through, behind the haptics switch.
- Extensions work in Little Radian: its Extensions button opens their popups
  against its page, and content scripts and ⌘E work there.
- Microphone and camera buttons on the sidebar player of a tab in a call. A
  call tab gets a player even when it is silent.
- "Share this tab instead": while a tab shares its screen, hover another
  sidebar tab to share it instead. The page shares again and gets that tab
  without the picker.
- New Note can open a new document in Notion, Google Docs, Word or Confluence
  (Settings > Profiles > New documents). Radian Notes stays the default.
- Share Quote: with text selected, the address pill shows the host over
  "Share Quote", and its link button becomes "Copy Quote as URL ⌃⇧⌘C". Hidden
  on Gmail, Slack and YouTube, as in Arc.
- Developer Mode bar with Arc's controls: Site Settings, Copy Link, Capture
  Window, Capture, Toggle Console, Toggle Network Panel, Inspect Element, and
  the Extensions and Split View menus. Console and Network dock right and
  close on a second press. A chevron next to reload offers Refresh (Ignore
  Cache) and Clear Cookies and Refresh.
- JSON documents open as a collapsible, colour-coded tree, with a
  Chromium-style "Pretty-print" checkbox to see the raw text.
- Clicking a web notification brings Radian forward and selects the tab that
  sent it.
- Windows that were full screen at quit come back full screen, and the window
  you last used gets focus again.
- Seven more Dock icons: Hologram, Metal, Schoolbook, Arcade, Sunset, Graphite
  and Fluted Glass, fourteen in all, in Settings > Icon.
- Click the grain dial in the theme editor to cycle the noise texture (grain,
  sand, denim, tweed), as in Arc.
- "Ask every time" for downloads per profile, a one-hour Little Radian archive
  delay, and adding or removing profiles from Settings.
- On critical macOS memory pressure, Radian puts one hidden tab to sleep each
  minute.

### Changed

- Settings looks and is organised like Arc's: General, Profiles, Links,
  Shortcuts, Icon and Advanced, in a fixed-size window named after the open
  pane. Search engine, suggestions, archive delay, document app and download
  location are set per profile; earlier choices are kept.
- "Restore windows from previous session" now only controls extra windows; the
  first window always comes back on its Space and tab. New installs get Arc's
  defaults: Warn before quitting on, restore windows off.
- The theme editor opens as Arc's popover next to the sidebar, with Arc's five
  swatch pages (Brand, gradients, Pastel, Drab, Greyscale, sampled from Arc),
  the appearance buttons inside the colour field, a wavy intensity slider and a
  dotted noise dial.
- Tooltips are Arc's navy pill, appearing after a second, with shortcuts drawn
  as keycaps. The sidebar toggle says "Hide sidebar" or "Lock sidebar", and the
  footer says "View Library ⇧⌘L" and each Space's name with ⌃1…⌃9.
- Pinned extensions sit inside the address pill and appear, with Copy Current
  URL and the Site Control Center button, when you hover the sidebar.
- The address pill's shield is now Arc's Site Control Center sliders button.
  The Site Control Center uses Arc's compact layout with a More menu; the
  blocked-ads count lives there.
- The sidebar's + opens Arc's menu: New Space, New Folder, New Easel, New
  Boost, New Split, New Tab. The today divider reads "↓ Clear".
- A Developer Mode tab's row gets Arc's caution-tape outline and its host and
  port under the title.
- The Library takes the sidebar's place, as in Arc, instead of opening in a
  tab: a section rail (Media, Downloads, Easels, Spaces, Boosts, Archived Tabs,
  then History), Arc's search fields, Filter button, date headings and empty
  states, and the page slides right beside it. Its Spaces section is Arc's
  Space manager, one column per Space. Easels and Notes open from it in Peek.
- ⌥⌘N opens Little Radian's own command bar in the top right of the screen.
  The Little Radian window looks like Little Arc: one address field with copy,
  a navy "Open in ‹Space› ⌘O" button with a More Spaces list, a first-run coach
  mark, and round Close and Full Screen buttons at its right edge.
- Little Radian opens on the desktop you are on and above Radian's full-screen
  window.
- Peek is a centred 1024 × 776 card with round navy buttons beside it. It opens
  in 230 ms and closes in 180 ms, as measured in Arc.
- The address of a hovered link shows as a navy pill, in Peek too.
- Switching Spaces while the sidebar floats is instant, as in Arc.
- The top loading glow grows with the page's progress; the shimmer across the
  address pill is gone.
- Background tabs that use a lot of CPU are paused instead of unloaded, so they
  keep their scroll and video position.
- Hovering "+ New Tab" shows its shortcut at the end of the row.
- Toasts use Arc's wording ("Copied Current URL", "New Tab Created in …",
  "Tab moved! Click to go there."), and a toast says when Battery Saver Mode
  turns off.
- Internal pages use macOS overlay scrollbars; sidebar text smoothing and
  secondary colours match Arc's measured values.
- The yellow outline marks the tab being shared rather than the page sharing
  it.
- App Nap is off, as in Arc.
- Wikipedia, Amazon, eBay and Google Translate open in the interface language.

### Fixed

- JavaScript Console (⌥⌘J) opens on the Console panel, and Inspect Elements
  (⌥⌘C) starts the element picker.
- Clicking the auto-archive toast opens Settings.
- A Library tab left by an older version is removed at launch.

### Security

- Pages opened from files (a document dropped from the Finder, Open With) no
  longer get Electron's extra file:// privileges, as in Chrome.

### Removed

- Windows support: the Windows build, its tests and its CI job. Radian is a
  Mac app; there are no Windows or Linux builds.

## [0.16.0] - 2026-10-23

### Added

- Radian starts as a fork of [Orbe](https://github.com/amadoubaui/orbe) 0.15.5
  by Amadou Ba, merged with its full history so upstream fixes can still be
  pulled.
- The project plan, the Arc feature ledger (78 features), the visual spec, Arc's
  menu bar, web research on Arc's look and motion, and the engine research
  behind choosing Electron.
- Measured Arc 1.170 specs for layout, colours and app bundle structure, under
  `docs/parity/captures/`.
- The Radian "R" logo and a new macOS app icon.
- Pages can read the current theme through `--arc-*` CSS variables, like in
  Arc.
- Little Radian gets Arc's "open in Space" button and a frame tinted with the
  Space's theme.
- Command Bar action rows show their keyboard shortcuts.
- A background test mode (`ORBE_BACKGROUND=1`, development only) that keeps
  Radian out of the Dock and never takes focus, so tests can run while you
  work.
- Open-source project files: README, contributing guide, code of conduct,
  security policy, notice file, issue and pull request templates, and
  `.editorconfig`.
- `npm run dist` builds `Radian.app`, then a drag-to-Applications DMG and a zip,
  `Radian-<version>-mac-arm64.dmg` and `.zip`, in `~/.orbe-dev/dist`.
- Optional Developer ID signing with the hardened runtime, and notarization of
  the DMG, when `RADIAN_SIGN_IDENTITY` and `RADIAN_NOTARY_PROFILE` are set.
  Builds are ad-hoc signed otherwise.
- A release workflow: pushing a `v*` tag builds Radian on Apple Silicon and
  attaches the DMG and the zip to a GitHub Release. Signing secrets are
  optional.
- Trackpad haptics like Arc's: a light tap when a dragged tab finds a new
  place and on the theme dial, with Arc's on/off switch in Settings. A small
  Swift helper plays them, since Electron has no haptics API.
- App icon picker in Settings > Appearance: seven Radian icons for the Dock.
- Every normal window comes back on relaunch with its size, Space and tabs,
  not just one.
- Background tabs that keep using a lot of CPU go to sleep, sooner in Battery
  Saver.
- The Command Bar learns which result you pick for what you type.
- Your own Site Search shortcuts (keyword plus a `%s` URL template), and Air
  Traffic Control rules for "URL contains" and "URL is equal to".
- Share in the tab menu, Capture Full Page (Option for Portrait) in Site
  Control Center, a "back to Picture in Picture" button on the sidebar video
  player, and New Window in the Dock menu.
- An English parity ledger, `docs/parity/status.md`, with the status of all 78
  Arc features.

### Changed

- Renamed Orbe to Radian everywhere a user can see it: app name, bundle id
  `com.radian.browser`, data folder, menus, About window and builds.
- The interface defaults to English, with Arc's menu wording. French stays
  available in Settings.
- Theme colours, the theme picker, the Command Bar and toasts restyled to
  match Arc.
- Window frame, sidebar and tab row layout matched to measurements of Arc.
- Sidebar and Space-switch animations retimed toward Arc's.
- Docs reorganised under `docs/`: the plan, Arc parity specs, research, and
  Orbe's original French docs in `docs/orbe/`.
- The README explains how to install the DMG and get past macOS's first-launch
  warning.
- The CI test workflow's step names and comments are in English.
- Arc's defaults: links from other apps open in Little Radian, Little windows
  archive after 6 hours, the Ctrl-Tab switcher shows 5 tabs, new folders are
  "Untitled" and the address placeholder reads "Search or Enter URL…".
- Secure sites show no lock, only a warning when a site is not secure.
- Developer Mode looks like Arc's: a dashed yellow and black outline on the tab
  and a blue bar with the full URL.

### Fixed

- The left-edge hover check ran 60 times a second in every window with a hidden
  sidebar, even in the background. It now runs only in the focused window.
- Copying links from the tab and folder menus kept tracking parameters.
- Text on the accent colour (Command Bar selection, toasts), the "New Tab"
  label and the Favorites hint now keep a 4.5:1 contrast.
- Pressing Enter in the Command Bar before new suggestions arrived could run
  the previous first row instead of what you typed.
- A Space swipe forced a layout on every frame for nothing.
- The welcome page showed Orbe's ring logo; it now shows Radian's R, and the
  mounted DMG shows Radian's icon too.
- The welcome page no longer asks for donations to Orbe. Orbe stays credited
  in the README, NOTICE and License, and in Help > Support Orbe.
- The end-to-end tests pass again on macOS and Windows.

[Unreleased]: https://github.com/amsultan2010/radian-browser/compare/v0.17.0...HEAD
[0.17.0]: https://github.com/amsultan2010/radian-browser/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/amsultan2010/radian-browser/releases/tag/v0.16.0
