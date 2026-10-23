# Contributing to Radian

Thanks for helping. Radian has one goal: an Arc user should be able to switch
to it without noticing a difference. The most useful contributions move it
closer to that goal.

This guide covers everything you need, in order:

1. [Ways to help](#ways-to-help)
2. [Your first pull request, step by step](#your-first-pull-request-step-by-step)
3. [How to format your work](#how-to-format-your-work)
4. [Where things live](#where-things-live)
5. [Tests](#tests)
6. [Code style](#code-style)
7. [The Arc-parity rule](#the-arc-parity-rule)
8. [Release process (maintainers)](#release-process-maintainers)

## Ways to help

You don't have to write code to help.

| You want to... | Do this |
| --- | --- |
| Report something broken | [Open a bug report](https://github.com/amsultan2010/radian-browser/issues/new?template=bug_report.yml) |
| Point out where Radian differs from Arc | [Report an Arc difference](https://github.com/amsultan2010/radian-browser/issues/new?template=arc_parity.yml), with a screenshot or recording of Arc if you can |
| Suggest something new | [Open a feature request](https://github.com/amsultan2010/radian-browser/issues/new?template=feature_request.yml) |
| Fix or build something | Read on, then open a pull request |

**What to work on.** [docs/parity/status.md](docs/parity/status.md) lists
every Arc feature and what Radian still lacks. Rows marked "Partial" are good
places to start. In order of priority:

1. **Arc differences**: a size, colour, animation, shortcut, menu item or
   behaviour that isn't the same as Arc.
2. **Bugs** in what already exists.
3. **Missing Arc features**, P0 first, then P1, then P2.
4. **Performance**: memory, battery and speed.

Out of scope for now: accounts, sync, AI features and Windows support.

**Before a big change**, open an issue first so we can agree on the approach.
Small fixes (a typo, a one-line bug, a wrong colour) can go straight to a pull
request.

## Your first pull request, step by step

You need a Mac with macOS 13 or later and [Node.js](https://nodejs.org) 20 or
newer. There are no npm dependencies to install and no build step.

1. **Fork** the repository on GitHub (the Fork button, top right), then clone
   your fork:

   ```sh
   git clone https://github.com/YOUR-USERNAME/radian-browser.git
   cd radian-browser
   ```

2. **Create a branch** from `main`, named after what you're doing (see
   [branch names](#branch-names)):

   ```sh
   git checkout -b fix/folder-drag-on-pinned
   ```

3. **Run Radian from source** to see your change as you work:

   ```sh
   npm start
   ```

   The first run downloads Electron (the engine Radian runs on) into
   `~/.orbe-dev`, outside the project. It takes a minute, once.

4. **Make your change.** Keep it to one topic. [Where things live](#where-things-live)
   tells you which file to open.

5. **Run the tests** that cover what you changed (see [Tests](#tests)). At
   least run `npm test`.

6. **Commit** in small steps, with messages in the
   [house format](#commit-messages):

   ```sh
   git add src/renderer/shell.css
   git commit -m "match arc's tab row height"
   ```

7. **Push** your branch to your fork:

   ```sh
   git push -u origin fix/folder-drag-on-pinned
   ```

8. **Open a pull request** on GitHub against `main`. The description comes
   pre-filled with a short template: fill it in, delete what doesn't apply.

9. **What happens next.** GitHub runs the full test suite on macOS and Windows
   (it takes about 6 minutes). A maintainer reviews your pull request and may
   ask for changes: push new commits to the same branch and the pull request
   updates itself. Once it's approved and the tests pass, it's merged with a
   merge commit (never squashed), so your commits keep your name.

## How to format your work

### Branch names

`type/short-description`, lowercase, words joined with hyphens:

| Type | Use it for | Example |
| --- | --- | --- |
| `fix/` | A bug | `fix/peek-close-on-escape` |
| `arc/` | Matching Arc more closely | `arc/command-bar-row-height` |
| `feat/` | A new feature | `feat/share-quote-button` |
| `docs/` | Documentation only | `docs/clearer-install-steps` |
| `test/` | Tests only | `test/split-view-resize` |

### Commit messages

One line, **lowercase, imperative** ("add", "fix", "match", not "added" or
"fixes"), no period at the end, about 70 characters at most. Say what the
commit does for a person using Radian, not which lines changed.

Good:

```
match arc's tab row height
fix folder drag onto the pinned section
show the last 5 tabs in the ctrl-tab switcher, as arc does
```

Not like this:

```
Fixed bug.
Update shell.css
WIP
```

If the reason isn't obvious, add a blank line and a short paragraph that
explains why:

```
watch the left edge for hover reveal only while the window has focus

The 16 ms poll ran in every window with a hidden sidebar, even in the
background, where it did nothing: about 60 wakeups a second per window.
```

Each commit should do one thing and leave Radian working, with the tests
passing. Several small commits are better than one big one.

### Pull requests

- **Title**: one plain sentence saying what changes, for example
  "Match Arc's Command Bar row height". Capital first letter, no period.
- **Description**: fill in the template. Say what changed, why, and how a
  reviewer can see it working.
- **One topic per pull request.** A bug fix and an unrelated restyle are two
  pull requests.
- **Show it.** For anything visible (layout, colour, motion), add a screenshot
  or a short recording, ideally next to Arc doing the same thing.
- **Link the issue** it closes with `Fixes #123` in the description.

## Where things live

| To change... | Look in |
| --- | --- |
| The sidebar, tab rows, favorites, Spaces bar | `src/renderer/shell.js`, `shell.css`, `shell.html` |
| The Command Bar, theme picker, toasts | `src/renderer/overlay.js`, `overlay.css`, `overlay.html` |
| Windows, tabs, split view, Peek (main process) | `src/main/window.js` |
| Menus and keyboard shortcuts | `src/main/menu.js`, `src/main/commands.js`, `src/main/shortcuts.js` |
| Settings and their defaults | `src/renderer/settings.*`, `src/main/store.js`, `src/main/prefs.js` |
| Theme colours and contrast | `src/renderer/theme.js` |
| Animation timings | `src/main/motion.js`, `src/renderer/base.css` |
| Any text shown to users | `src/shared/locales.js` (English and French) |
| Search suggestions | `src/main/suggest.js`, `src/main/palette.js` |
| The Mac build and DMG | `scripts/build-mac.js` |
| What Arc does, measured | `docs/parity/` |

Older code, comments and test names are in French: Radian is a fork of
[Orbe](https://github.com/amadoubaui/orbe), a French project. Write anything
new in English. See [Code style](#code-style).

## Tests

```sh
npm test                            # end-to-end tests (the main suite)
npm run test:ui                     # interface tests with a real mouse and keyboard
npm run test:ui -- 01-commande      # only the interface tests whose name matches
npm run test:ext                    # extension API tests, in the real browser
node tests/adblock.test.js          # ad blocker
node --test tests/extensions.test.js
node tests/suggest.test.js          # Command Bar ranking
node tests/liens.test.js            # site search and link routing rules
```

- Test windows on macOS are invisible and don't take your mouse or keyboard,
  so you can keep working while they run. `ORBE_TEST_VISIBLE=1` shows them.
  A few tests type into pages and only pass with visible windows; GitHub's
  run (which shows them) is the one that counts.
- GitHub runs everything on macOS and Windows for every push
  ([.github/workflows/tests.yml](.github/workflows/tests.yml)).
- **A bug fix comes with a test** that fails before the fix and passes after.
  **A new feature comes with tests** for what it does. The suites are in
  `tests/`; open the one closest to your change and follow its style.

## Code style

- Plain JavaScript, HTML and CSS. No framework, no bundler, and no new npm
  dependency without agreeing on it in an issue first.
- Two-space indentation, LF line endings, a final newline. Your editor picks
  this up from [.editorconfig](.editorconfig).
- Match the code around you: its naming, its comment style, its patterns.
- Write new code and comments in English. Translate existing French only in
  the lines you change anyway; never rename or translate files in bulk.
- Put every piece of interface text in `src/shared/locales.js`, in both the
  `en` and `fr` objects, under the same key.
- Comment the reason for something when the code can't show it. Don't
  comment what the code already says.

## The Arc-parity rule

**Behaviour comes from observing Arc, never from its code or assets.**

Allowed:

- Using Arc and watching what it does.
- Screenshots and screen recordings of Arc, measured frame by frame.
- Arc's public help pages and release notes.
- Reading your own Arc data files (for the importer), and metadata such as
  menus, window sizes and the accessibility tree.

Not allowed:

- Decompiling, disassembling or reading Arc's code.
- Copying Arc's icons, images, sounds, Lottie animations, fonts or other
  assets, extracted or otherwise.
- Using the Arc name or logo for Radian.

Match motion by measurement, not by eye: record Arc, measure durations,
distances and curves, then reproduce them. Put the numbers in a `spec.md`
under `docs/parity/captures/<feature>/`. Raw screenshots and recordings stay in
`docs/parity/captures/_raw/`, which git ignores. Never commit videos.

## Release process (maintainers)

Releases are built by GitHub Actions, in
[.github/workflows/release.yml](.github/workflows/release.yml), on an Apple
Silicon Mac.

1. Bump `version` in `package.json`.
2. In `CHANGELOG.md`, move the entries under `[Unreleased]` into a new
   `[X.Y.Z] - YYYY-MM-DD` section, and add its link at the bottom.
3. Merge that to `main`, then tag the merge commit with the same version and
   push the tag:

   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

The workflow builds Radian and attaches `Radian-X.Y.Z-mac-arm64.dmg` and
`Radian-X.Y.Z-mac-arm64.zip` to a GitHub Release for the tag. You can also start
it by hand from the Actions tab. Radian's update check finds the new release on
its own.

### Signing and notarization

Without signing secrets, the release is ad-hoc signed and not notarized, so
users see the first-launch steps in the [README](README.md#first-launch). To
sign with a Developer ID and notarize in CI, add these repository secrets:

| Secret | What it is |
| --- | --- |
| `MACOS_CERTIFICATE` | The Developer ID Application certificate and its private key, exported as a `.p12` file, base64-encoded |
| `MACOS_CERTIFICATE_PASSWORD` | The password of that `.p12` file |
| `APPLE_ID` | The Apple ID used to notarize |
| `APPLE_TEAM_ID` | The team ID of the Apple Developer account |
| `APPLE_APP_PASSWORD` | An app-specific password for that Apple ID |

To sign and notarize a local build, store your notarization credentials in the
keychain once, then set two environment variables before `npm run dist`:

```sh
xcrun notarytool store-credentials radian-notary   # asks for your Apple ID, team ID and app-specific password
export RADIAN_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export RADIAN_NOTARY_PROFILE=radian-notary
npm run dist
```

With both set, the app is signed with the hardened runtime, and the DMG is
notarized and stapled. Without them, the build is ad-hoc signed.

## Security

Don't report vulnerabilities in public issues or pull requests. See
[SECURITY.md](SECURITY.md).

## Code of conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
