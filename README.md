# Radian

**An open-source macOS browser that works like Arc.**

Arc stops working on 2026-12-22. Radian aims to be a browser an Arc user can
switch to without noticing a difference, apart from the name, logo, icons and
sounds: same sidebar, Spaces, shortcuts, menus, themes and animations. It is
just a browser: no AI features, and no accounts or sync for now.

> Independent project, not affiliated with The Browser Company. Radian contains
> no code or assets from Arc. Behaviour is matched by watching Arc run, never
> by reading its code.

Status: **early.** Radian is built on Electron (Chromium) and starts from
[Orbe](https://github.com/amadoubaui/orbe), an MIT-licensed Arc-style browser
by Amadou Ba. The plan and its phases are in [PLAN.md](PLAN.md).

## Built on Orbe

Most of what works today comes from Orbe: the sidebar with favorites, pinned
tabs, folders and today tabs; Spaces with their own icon, theme and profile;
the gradient theme editor; the command bar (⌘T / ⌘L); split view up to four
panes; Peek; Little Radian windows; incognito; the archive; the Library;
Boosts; Easels; Notes; the mini media player; a built-in ad and tracker
blocker; a password manager encrypted with the system keychain; Chrome Web
Store extensions; and import from Arc. Thank you, Amadou.

Orbe's code, comments and docs are in French. Radian's interface defaults to
English (French stays available in Settings); code is translated only as it is
touched.

## Run from source

Needs [Node.js](https://nodejs.org) 20 or newer. There are no npm
dependencies: the scripts download Electron themselves.

```sh
git clone https://github.com/amsultan2010/radian-browser.git
cd radian-browser
npm start         # run the browser
npm test          # end-to-end tests
npm run test:ui   # Playwright UI tests with real mouse and keyboard input
npm run test:ext  # extension API tests, in the real browser
npm run build     # builds ~/.orbe-dev/dist/Radian.app (-- --install copies it to /Applications)
```

On first run, Electron is downloaded into `~/.orbe-dev`, outside the project.
Browser data lives in `~/Library/Application Support/Radian`.

Protected video (Widevine): `ORBE_DRM=1 npm start` uses the castLabs build of
Electron.

## Code layout

```
src/main/       main process: windows, tabs, menus, data
src/preload/    bridge between the interface and the main process
src/renderer/   interface: sidebar, command bar, internal pages
src/shared/     interface text (English and French)
tests/          end-to-end, UI (Playwright) and real-site tests
docs/           Orbe's notes on Arc and its roadmap (in French)
parity/         what Arc is and does, measured from the real app
```

Plain JavaScript, HTML and CSS: no framework and no build step.

## License

[MIT](LICENSE), keeping Orbe's copyright notice. The blocklist
(`assets/blocklist.txt`) combines public lists that keep their own licenses
(MIT and CC BY 3.0), noted at the top of the file.
