# Changelog

All notable changes to Radian are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and Radian aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The version number still carries on from Orbe 0.15.5 until Radian's first
release.

## [Unreleased]

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

[Unreleased]: https://github.com/amsultan2010/radian-browser/commits/main
