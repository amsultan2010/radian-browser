# Contributing to Radian

Thanks for helping. Radian has one goal: an Arc user should be able to switch
to it without noticing a difference. The most useful contributions move it
closer to that goal.

## Contribution priorities

1. **Arc differences.** Anything Radian does differently from Arc: a size, a
   colour, an animation, a shortcut, a menu item, a missing feature.
2. **Bugs** in what already exists.
3. **Missing Arc features**, in the priority order of
   [docs/parity/features.md](docs/parity/features.md) (P0, then P1, then P2).
4. **Performance**: memory, battery and speed, measured against Arc.

Out of scope for now: accounts, sync, AI features and Windows support.

## Before you start

- Search [existing issues](https://github.com/amsultan2010/radian-browser/issues)
  and pull requests first.
- For anything bigger than a small fix, open an issue to agree on the approach
  before writing code.
- For a difference from Arc, use the
  [Radian differs from Arc](https://github.com/amsultan2010/radian-browser/issues/new?template=arc_parity.yml)
  template and include what Arc does, ideally with a screenshot or recording.

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

## Development setup

You need macOS and [Node.js](https://nodejs.org) 20 or newer.

```sh
git clone https://github.com/amsultan2010/radian-browser.git
cd radian-browser
npm start
```

There are no npm dependencies and no build step. On first run the scripts
download the Electron version pinned in `package.json` into `~/.orbe-dev`,
outside the project. `ORBE_DRM=1 npm start` uses the castLabs build with
Widevine instead, installed into `~/.orbe-dev-drm`.

## Tests

```sh
npm test                            # end-to-end tests
npm run test:ui                     # Playwright UI tests, real mouse and keyboard
npm run test:ui -- 01-commande      # only the UI tests whose name matches
npm run test:ext                    # extension API tests, in the real browser
node tests/adblock.test.js          # ad blocker
node --test tests/extensions.test.js
ORBE_SCENARIO=tests/sites.js node scripts/dev.js --selftest   # real sites (needs the network)
```

Test windows on macOS are invisible and don't take the mouse or keyboard, so
you can keep working while they run (`ORBE_TEST_VISIBLE=1` shows them).
CI runs the suite on macOS and Windows for every push
([.github/workflows/tests.yml](.github/workflows/tests.yml)).

Bug fixes come with a test that fails before the fix. New features come with
tests for what they do.

## Code style

- Plain JavaScript, HTML and CSS. No framework, no bundler, and no new npm
  dependency without agreeing on it in an issue first.
- Two-space indentation, LF line endings, a final newline. Your editor picks
  this up from [.editorconfig](.editorconfig).
- Match the code around you.
- Orbe's code, comments and docs are in French. Write new code and comments in
  English. Translate existing French only in the lines you change anyway:
  never rename or translate in bulk.
- Interface text goes in `src/shared/locales.js`, in English and French.

## Branches and commits

- Branch from `main`. Never commit to `main` directly.
- Make small commits: one change per commit, and each commit builds and
  passes the tests on its own.
- Write commit messages in lowercase imperative, like the existing history:
  `fix folder drag onto the pinned section`, `match arc's tab row height`.

## Pull requests

- One topic per pull request. Fill in the template.
- Run the tests before you open it.
- For visual or motion changes, add screenshots or a recording of Radian next
  to Arc.
- Pull requests are merged with a merge commit, never squashed or rebased, so
  the history (including Orbe's) stays intact.

## Release process

Releases are built by GitHub Actions, in
[.github/workflows/release.yml](.github/workflows/release.yml), on an Apple
Silicon Mac.

1. Bump `version` in `package.json`.
2. In `CHANGELOG.md`, move the entries under `[Unreleased]` into a new
   `[X.Y.Z] - YYYY-MM-DD` section, and add its link at the bottom.
3. Commit, then tag the commit with the same version and push the tag:

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
