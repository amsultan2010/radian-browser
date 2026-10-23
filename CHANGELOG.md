# Changelog

All notable changes to Radian are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and Radian aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Radian's first release is 0.16.0; its version number carries on from Orbe 0.15.5.

## [Unreleased]

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

[Unreleased]: https://github.com/amsultan2010/radian-browser/compare/v0.16.0...HEAD
[0.16.0]: https://github.com/amsultan2010/radian-browser/releases/tag/v0.16.0
