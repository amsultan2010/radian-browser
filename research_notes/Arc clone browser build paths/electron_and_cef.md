# Electron and CEF as engines for an Arc-identical macOS browser (as of 22 Oct 2026)

Research date: 2026-10-22. Version anchors checked: Electron v45.0.0 shipped 2026-10-21 on Chromium 156.0.8078.48 ([Electron v45.0.0 release](https://github.com/electron/electron/releases/tag/v45.0.0)). The newest castLabs ECS (Widevine Electron) stable builds are v44.5.1 (2026-10-03) and v43.7.7 (2026-10-04). ECS v45 is still alpha (v45.0.0-alpha.14, 2026-10-04) ([castLabs releases](https://github.com/castlabs/electron-releases/releases)). I did not independently verify the "CEF 156 is current stable" premise. The CEF repo was last pushed 2026-10-22 ([chromiumembedded/cef](https://github.com/chromiumembedded/cef)).

## 1. Electron Chrome-extension support (native, MV3, electron-chrome-extensions / web store, real-world compatibility, DNR, native messaging)

### Takeaway
Electron alone supports only a small, DevTools-oriented subset of chrome.* APIs, and its docs call full Chrome compatibility a "non-goal". A browser-grade extension system needs samuelmaddock's electron-chrome-extensions and electron-chrome-web-store. These are GPL-3 or paid-license, last published to npm in July 2025, and real-world MV3 extensions (1Password, Bitwarden, uBO/uBO Lite, NordPass) have repeatedly broken across Electron majors 40 to 43 in 2026. declarativeNetRequest does not appear to be implemented in Electron, which matters for uBlock Origin Lite.

### Cited Findings
**Electron core (docs, current main branch, read 2026-10-22)**
- Electron "supports a subset of the Chrome Extensions API, primarily to support DevTools extensions and Chromium-internal extensions". The docs also say: "Electron does not support arbitrary Chrome extensions from the store, and it is a **non-goal** of the Electron project to be perfectly compatible with Chrome's implementation of Extensions." — [electron/docs/api/extensions.md](https://github.com/electron/electron/blob/main/docs/api/extensions.md)
- Only unpacked extensions load; `.crx` does not work. Extensions are not remembered across restarts, so `loadExtension` must run on every boot. In-memory (non-persistent) sessions throw, so there are no extensions in incognito-style sessions. — [extensions.md](https://github.com/electron/electron/blob/main/docs/api/extensions.md); [Electron extensions-api docs](https://www.electronjs.org/docs/latest/api/extensions-api)
- The officially listed supported APIs are:
  - `chrome.devtools.inspectedWindow`, `.network` and `.panels` (full support).
  - `chrome.extension` (`getURL`, `getBackgroundPage`, `lastError`).
  - `chrome.management` (getAll, get, getSelf, permission warnings, onEnabled/onDisabled).
  - `chrome.runtime` (connect, sendMessage, getManifest, getURL, reload, onStartup, onInstalled, onMessage, onConnect, and others).
  - `chrome.scripting` (full).
  - `chrome.storage.local` only. `sync` and `managed` are "**not** supported".
  - `chrome.tabs`: only sendMessage, reload and executeScript, plus partial query (url/title/audible/active/muted) and partial update (url/muted). A tab id of `-1` is unsupported.
  - `chrome.webRequest` (full, but Electron's own `webRequest` module "takes precedence" on conflicts).

  The docs say APIs not listed are "provisional and may be removed". — [extensions.md](https://github.com/electron/electron/blob/main/docs/api/extensions.md)
- The supported manifest keys listed include `background` "(Manifest V2)" and `host_permissions` "(Manifest V3)". The docs do not list `background.service_worker`. — [extensions.md](https://github.com/electron/electron/blob/main/docs/api/extensions.md)
- MV3 service-worker hosting was fixed upstream in mid-2023 ("fix: Chrome Extensions service worker host registration", PR #39290, closed 2023-07-31). — [electron/electron#39290](https://github.com/electron/electron/pull/39290)
- Electron's own extension permission list (`_permission_features.json`) has no `declarativeNetRequest`. Electron's `chromium_src/BUILD.gn` compiles only `declarative_net_request/request_action.*` and the flat ruleset target, with the comment "These are required by the webRequest module". It does not compile the DNR API itself. — [_permission_features.json](https://github.com/electron/electron/blob/main/shell/common/extensions/api/_permission_features.json); [chromium_src/BUILD.gn](https://github.com/electron/electron/blob/main/chromium_src/BUILD.gn) (read 2026-10-22)
- Open or recent Electron extension bugs as of Oct 2026:
  - `chrome.storage.onChanged` events are not delivered to MV3 service workers (#52451, open, filed 2026-07-25).
  - Loading an extension with `webRequest` or `declarativeNetRequest` permissions into a session makes main-process `net.fetch` fail with ERR_FAILED (#55106 closed 2026-10-19; #54685 open 2026-10-07). — [#52451](https://github.com/electron/electron/issues/52451); [#55106](https://github.com/electron/electron/issues/55106); [#54685](https://github.com/electron/electron/issues/54685)
- Electron 43 shipped a packaging regression. The extension renderer bindings moved into a new `.pak` in Chromium 150 that Electron 43 did not repack, so `chrome.webRequest` became an empty object in MV3 workers and "MV3 service worker registration fails entirely". The reporter observed this with NordPass. The fix landed on main (PRs #51804 and #52290, "shipping in Electron 44") with a no-backport label. The same thread says webRequest events "are never dispatched to MV3 service workers" even on main. — [electron/electron#52265](https://github.com/electron/electron/issues/52265) (2026-07)
- Electron 45 (2026-10-21) changed preload behaviour: a `chrome-extension://` frame embedded in an ordinary page no longer receives the window's preload scripts. — [v45.0.0 release notes](https://github.com/electron/electron/releases/tag/v45.0.0)

**electron-chrome-extensions / electron-chrome-web-store (samuelmaddock/electron-browser-shell)**
- The latest npm versions are electron-chrome-extensions 4.9.0 and electron-chrome-web-store 0.13.0, both published 2025-07-02. The repo has 740 stars and 42 open issues, and is not archived. After July 2025 the only commits are three on 2026-09-01 ("chore: upgrade to latest electron", a CI change, and "fix: resolve relative URLs in chrome.windows.create"). No npm release followed. — [npm electron-chrome-extensions](https://www.npmjs.com/package/electron-chrome-extensions); [repo commits](https://github.com/samuelmaddock/electron-browser-shell/commits/master) (queried 2026-10-22)
- The README says it "aims to bring extension support in Electron up to the level you'd come to expect from a browser like Google Chrome". It requires Electron ≥ v35.0.0-beta.8, says "All background scripts are persistent", and requires `sandbox: true` for service-worker preload scripts. Using Electron's own `webRequest` API "will prevent `chrome.webRequest` listeners from being called". — [electron-chrome-extensions README](https://github.com/samuelmaddock/electron-browser-shell/blob/master/packages/electron-chrome-extensions/README.md)
- APIs it adds:
  - `chrome.action`: title, icon, popup, badge text and color, openPopup and onClicked. enable and disable are unchecked.
  - `chrome.cookies`: full.
  - `chrome.contextMenus`: create, remove and onClicked. `update` is unchecked.
  - `chrome.notifications`: mostly supported. `onButtonClicked` is unchecked.
  - `chrome.runtime.openOptionsPage`.
  - `chrome.storage.sync` and `managed`, both falling back to `local`.
  - tabs and windows hooks through app callbacks (createTab, selectTab, removeTab, createWindow, removeWindow, requestPermissions).

  `chrome.commands` (getAll, onCommand) is **not** supported. — [README](https://github.com/samuelmaddock/electron-browser-shell/blob/master/packages/electron-chrome-extensions/README.md)
- License: "GPL-3. For proprietary use, please contact me or sponsor me on GitHub … to acquire a proprietary-use license" (the Patron license). — [README](https://github.com/samuelmaddock/electron-browser-shell/blob/master/packages/electron-chrome-extensions/README.md)
- electron-chrome-web-store provides:
  - `installChromeWebStore`, which enables installs from chromewebstore.google.com.
  - `installExtension`, `uninstallExtension` and `updateExtensions`.
  - `autoUpdate`, which updates at startup and "once every 5 hours" (default true).
  - allowlist and denylist, and a `beforeInstall` prompt hook.

  The README's examples install Dark Reader, React DevTools and uBlock Origin Lite. — [electron-chrome-web-store README](https://github.com/samuelmaddock/electron-browser-shell/blob/master/packages/electron-chrome-web-store/README.md)
- Native messaging: the July 2025 release includes "always disconnect native port when native messaging host is destroyed (#156)", so the library implements native messaging. In 2021 issue #36 had reported "Extension native messaging not supported". — [commits](https://github.com/samuelmaddock/electron-browser-shell/commits/master); [#36](https://github.com/samuelmaddock/electron-browser-shell/issues/36)

**Real-world compatibility reports**
- **1Password, Obsidian Web Clipper, Dark Reader and uBO (MV2):** on Electron 40, "mv3 service worker extensions like 1password and obsidian web clipper stopped working" with infinite-loading popups. "dark reader (doesn't load sometimes) and ublock origin (mv2) has also been broken for a while." A second user bisected the break to 40.0.0-alpha.2→alpha.4 and said they "work again in 41.0.0-alpha.1 and up". The issue is still open. — [electron-browser-shell#172](https://github.com/samuelmaddock/electron-browser-shell/issues/172) (2026-01/02)
- **1Password (2024):** in Feb 2024, 1Password and Okta failed to load because they are MV3. The maintainer closed it as "caused by lack of Manifest v3 support". — [#93](https://github.com/samuelmaddock/electron-browser-shell/issues/93)
- **1Password in Min (Electron):** autofill did not appear, and credentials were only available with Cmd+\. — [minbrowser/min#2151](https://github.com/minbrowser/min/issues/2151) (2022, open)
- **Bitwarden:** an open PR polyfills `chrome.storage.session` because a Bitwarden feature is broken without it. — [#182](https://github.com/samuelmaddock/electron-browser-shell/pull/182) (2026-03-29). In Flow Browser, Bitwarden's right-click context menu was stuck on "unlock your vault". The developer said it would be fixed in the next version (2026-04-02). — [flow-browser#101](https://github.com/multiboxlabs/flow-browser/issues/101)
- **uBlock Origin / uBO Lite:** in Flow Browser, both "fail to intercept anything". The cause was attributed to the app's own `session.webRequest.onBeforeSendHeaders` hook (UA scrubbing), which the developer called "a known issue". — [flow-browser#153](https://github.com/multiboxlabs/flow-browser/issues/153) (2025-07, open)
- **webRequest PR #183 and ad blockers:** a PR adding observational `chrome.webRequest` was closed unmerged ("Will revisit", 2026-08-11). A tester said it "breaks adblockers" and that uBO Lite blocked ads on Electron 43 only *without* the PR. — [#183](https://github.com/samuelmaddock/electron-browser-shell/pull/183). This conflicts with the source finding above that Electron does not compile the DNR API. Unresolved.
- **Grammarly:** "Unable to login" (2022) and popup blinking (2021), both closed. — [#62](https://github.com/samuelmaddock/electron-browser-shell/issues/62); [#33](https://github.com/samuelmaddock/electron-browser-shell/issues/33)
- **Other open issues:** the browser action icon does not update (#153). The "Local Extension Settings" folder "grows exponentially (10GB +)" (#158). `chrome.extension` is not exported to content scripts (#175). — [#153](https://github.com/samuelmaddock/electron-browser-shell/issues/153); [#158](https://github.com/samuelmaddock/electron-browser-shell/issues/158); [#175](https://github.com/samuelmaddock/electron-browser-shell/issues/175)
- **Flow Browser's fork:** the Arc-like Flow Browser depends on a fork, `npm:@iamevan/electron-chrome-extensions@4.9.4` and `@iamevan/electron-chrome-web-store@0.13.3`, rather than upstream. — [flow-browser package.json](https://github.com/multiboxlabs/flow-browser/blob/main/package.json)

### Inferences
- In an Electron browser, extension compatibility is something you would own and patch per Electron major. In 2026 alone, 1Password broke in Electron 40, and NordPass (and any MV3 worker using webRequest) broke in Electron 43. Each was fixed only in a later major, without backports.
- Without DNR, uBO Lite and other MV3 content blockers cannot work as designed. Classic uBO (MV2) is also unreliable. An Arc-identical ad-blocking story would probably need a built-in blocker (for example via `session.webRequest`). That in turn blocks extensions' `chrome.webRequest`, per the README limitation.
- `chrome.commands` is missing, so extension keyboard shortcuts (such as 1Password's or Bitwarden's) won't register. Vimium mostly uses content scripts and probably works, but this is unverified.
- The GPL-3 license on electron-chrome-extensions forces either open-sourcing the browser or buying the Patron license.

### Gaps
- No primary report found for Vimium or React DevTools on Electron 44/45. React DevTools is the canonical DevTools extension that Electron targets, but I found no 2026 test.
- No authoritative statement on whether MV2 extensions still load in Electron 45 (Chromium 156).
- Whether the 2026-09-01 "upgrade to latest electron" commit was validated on Electron 44/45 is unknown, since no release or changelog was published.
- Unresolved conflict over whether uBO Lite (DNR) blocks anything on stock Electron.

## 2. DRM: castLabs Electron for Content Security (ECS) + Widevine

### Takeaway
DRM on Electron requires castLabs ECS (a drop-in Electron fork) plus a production VMP signature from castLabs EVS, which is free with signup. With that, castLabs states Netflix works (re-verified 2026-03 on v40.7.0 and v41 beta). Expect Chrome-on-Mac-class quality at best (Netflix caps Chrome on Mac at 1080p), ECS builds that are monthly and trail stock Electron, and fuse and signing-order constraints.

### Cited Findings
- ECS is "a fork of Electron created by Castlabs to facilitate the use of Google's Widevine CDM … including support for Verified Media Path (VMP)". It has "full support for Windows and macOS". The CDM is installed on first launch through the Component Updater, and apps must `await components.whenReady()` before opening windows. — [castlabs/electron-releases README](https://github.com/castlabs/electron-releases)
- The released builds "are VMP-signed for development and can be used with Widevine UAT". "For production use you can sign up for our EVS service … Previously a license agreement with Google Widevine was required … with EVS this is no longer necessary." — [README](https://github.com/castlabs/electron-releases)
- EVS "is a free service, but requires signup to use". It signs macOS and Windows only (no Linux). It uses a Python CLI: `python3 -m pip install castlabs-evs`, then `python3 -m castlabs_evs.vmp sign-pkg <dir>`. On macOS, VMP signing must happen **before** Apple code signing. Persistent-license support was removed from the browser CDM as of ECS v42, so `streaming` signatures are the right choice. Custom forks or full fuse support go through a paid Widevine 3PL route (contact 3pl@castlabs.com, no public price). — [EVS wiki](https://github.com/castlabs/electron-releases/wiki/EVS)
- "There is partial support for using fuses with ECS" from v35. Full fuse support needs 3PL certification, with "additional contractual concerns and costs". — [ECS FAQ](https://github.com/castlabs/electron-releases/wiki/FAQ)
- Support policy: castLabs aims to "support the three latest *stable* major versions". The wiki table marks 44.x (Chromium 152), 43.x (150) and 42.x (148) as supported. From August 2025, builds were cut to "one build per month for each of the supported release-series", so "not every release of Electron will have a corresponding ECS release". — [ECS wiki home](https://github.com/castlabs/electron-releases/wiki)
- Current releases: v44.5.1+wvcus (2026-10-03), v43.7.7+wvcus (2026-10-04), v42.11.10+wvcus (2026-10-05) and v45.0.0-alpha.14+wvcus (2026-10-04). — [castLabs releases](https://github.com/castlabs/electron-releases/releases)
- **Netflix:** the castLabs maintainer said (2026-03-15): "I just did a quick test with Netflix using both v40.7.0 and v41.0.0-beta.7, and both work fine after I properly VMP-signed the builds." Failures are usually a broken VMP signature (from changing fuses, or packaging a re-downloaded ECS) or opening windows before the CDM registers. — [castlabs#224](https://github.com/castlabs/electron-releases/issues/224). Earlier, Netflix E100 and M7121-1331 errors were traced to missing production VMP or not using the components API. — [castlabs#199](https://github.com/castlabs/electron-releases/issues/199) (2025-04)
- **Netflix resolution:** Netflix's help page lists Chrome 117+ on Mac at "Up to Full HD (1080p)", Edge on Mac at 720p, and Safari 14+ on Mac at "Up to Ultra HD (2160p)". On Windows, Chrome and Edge reach 2160p only on qualifying hardware. — [Netflix supported browsers](https://help.netflix.com/en/node/23742) (fetched 2026-10-22)
- **Disney+:** returned "code 83 unless you specifically set the user agent to Chrome". With a Chrome UA, DRM playback worked. — [castlabs#142](https://github.com/castlabs/electron-releases/issues/142) (2022, still open)
- **Spotify:** a Web Playback SDK issue ("playing just 1 sec") was closed in 2025. — [castlabs#193](https://github.com/castlabs/electron-releases/issues/193). Flow Browser's UA code notes that keeping the Electron UA token "Causes issues with Spotify", so it strips it. — [flow-browser user-agent.ts](https://github.com/multiboxlabs/flow-browser/blob/main/src/main/modules/user-agent.ts)
- **Apple Music:** in 2026 a user reported Apple Music licensing (-1021) failing because the Media Foundation Widevine CDM path appeared gated in ECS. Closed 2026-08-30. — [castlabs#234](https://github.com/castlabs/electron-releases/issues/234)
- **Flow Browser:** ships on castLabs ECS (`electron: castlabs/electron-releases#v41.1.1+wvcus`) and tracks ECS bumps in PRs. — [flow-browser package.json](https://github.com/multiboxlabs/flow-browser/blob/main/package.json); [flow-browser#252](https://github.com/multiboxlabs/flow-browser/pull/252)

### Inferences
- Chromium version lag: on 2026-10-22 the newest stable ECS (44.x) is Chromium 152, while Chrome stable and Electron 45 are Chromium 156. A DRM-capable Electron browser would sit about 4 Chromium majors behind Arc/Chrome until ECS 45 goes stable. Monthly ECS cadence also delays security patches.
- At best, Netflix on macOS would match Chrome's 1080p cap, provided the UA reads as Chrome. That is likely the same as Arc, which also uses Chromium's Widevine. This is unverified for Arc.
- macOS signing pipeline order: EVS VMP sign, then Apple codesign and notarize. Any post-sign binary change (fuses, re-packaging) breaks VMP.

### Gaps
- No 2025-2026 primary report on Prime Video, Hulu or Max in ECS, and no measured ECS resolution for Disney+ or Prime.
- No public castLabs price for "premium customers" or 3PL.
- Not verified whether Widevine/Netflix treat an ECS browser that spoofs a Chrome UA differently from Chrome (for example a VMP-based tier).

## 3. Google sign-in in Electron/CEF ("This browser or app may not be secure")

### Takeaway
Google has blocked sign-ins from embedded frameworks since 2019, naming CEF explicitly. Electron browsers usually get through by scrubbing the `Electron/x` UA token, or by sending a Firefox UA only to accounts.google.com (Min's approach). In March 2026, one ECS-based browser team reported that UA plus client-hint spoofing still failed on v40.7.0. Expect it to be fragile and intermittent rather than solved.

### Cited Findings
- Google's April 2019 Security Blog announced blocking sign-ins from embedded browser frameworks (from June 2019). It said man-in-the-middle phishing is hard to detect when CEF "or another automation platform" handles authentication, and recommended browser-based OAuth instead. — [Google Security Blog, 2019-04-18](https://security.googleblog.com/2019/04/better-protection-against-man-in-middle.html); [BleepingComputer summary](https://www.bleepingcomputer.com/news/security/google-to-block-logins-from-embedded-browser-frameworks)
- **Min (Electron):** removes `Min/` and `Electron/` from the UA globally and zeroes the minor Chrome version. Its code comment reads "Google blocks signin in some cases unless a custom UA is used", and it swaps a **Firefox** UA for requests to `accounts.google.com`, plus a custom `SEC-CH-UA` header. — [min/main/UASwitcher.js](https://github.com/minbrowser/min/blob/master/main/UASwitcher.js)
- Min users still hit the block in 2023. The maintainer noted "some randomness to the behavior". Sign-in was also broken when Min's tracker blocker blocked `accounts.google.com/v3/signin/_/AccountsSignInUi/browserinfo`. The issue is still open. — [min#2306](https://github.com/minbrowser/min/issues/2306); older thread [min#868](https://github.com/minbrowser/min/issues/868)
- **Flow Browser (Electron/ECS):** strips `Electron/x` from the UA by default. A code comment says adding an Edge UA "Causes a few issues with Google Auth". It removes its own app token and adds Chrome client headers for `chromewebstore.google.com`. — [flow-browser user-agent.ts](https://github.com/multiboxlabs/flow-browser/blob/main/src/main/modules/user-agent.ts); [PR #45 "Scrub User Agent", merged 2025-05-20](https://github.com/multiboxlabs/flow-browser/pull/45)
- **Counter-report (2026-03):** a team "building an Electron-based desktop browser using CastLabs ECS" reported: "UA spoofing on v40.7.0 — Stripped Electron/ token, added Sec-CH-UA client hints for Google domains … Google still blocks the login — they appear to fingerprint actual Chromium capabilities beyond the UA string." The castLabs maintainer replied that ECS v40 is Chromium 144 and asked for a reference. The issue closed without resolution. — [castlabs#224](https://github.com/castlabs/electron-releases/issues/224)
- A web-search summary of developer reports (Pragli on DEV) says Electron apps were blocked and worked around it by doing OAuth in the system browser. That is fine for app login but not for a browser's own web sign-in. — [DEV: How to authenticate with Google OAuth in Electron](https://dev.to/pragli/how-to-authenticate-with-google-oauth-in-electron-5218) (date not shown)

### Inferences
- The minimum mitigation is a Chrome-identical UA and client hints with no `Electron/` token, plus not blocking Google's `browserinfo` endpoint, with a fallback Firefox UA on accounts.google.com.
- Google's risk scoring appears to go beyond the UA (castLabs#224). Expect occasional blocks a user can't fix.
- CEF Chrome style presents as stock Chromium, which probably helps, but I found no 2025-2026 CEF-specific report either way.

### Gaps
- No Google-authored 2025-2026 statement on how it detects embedded frameworks.
- No CEF Chrome-style sign-in report found.
- Whether passkey-based Google sign-in avoids the block is unverified (see Flow #280 in section 4).

## 4. Passkeys/WebAuthn with Touch ID, and password autofill

### Takeaway
As of Oct 2026, Electron has two WebAuthn paths on macOS:
- A Touch ID platform authenticator (Electron ≥ 41.5, May 2026). It works for any site, but credentials are device-bound and not synced.
- iCloud Keychain / credential-provider passkeys via ASAuthorizationController (Electron 45.0.0, 2026-10-21). This path only works for relying parties listed in your app's Associated Domains, so it can't serve arbitrary websites the way Arc/Chrome do.

There is no built-in password manager and no macOS Password AutoFill integration. Electron browsers rely on extensions, CLI integrations or their own vaults. CEF Chrome style includes Chrome's password manager.

### Cited Findings
- **Touch ID (Electron 41.5.0):** "Added `app.configureWebAuthn()` to enable the Touch ID platform authenticator for WebAuthn on macOS, and a `select-webauthn-account` session event" (also in 42). — [v41.5.0 notes](https://github.com/electron/electron/releases/tag/v41.5.0); [PR #51412](https://github.com/electron/electron/pull/51412)
- **iCloud Keychain passkeys (Electron 45.0.0):** "Added `app.configureWebAuthn()` API to enable iCloud Keychain passkey support on macOS … present Apple's native passkey UI via ASAuthorizationController". — [v45.0.0 notes](https://github.com/electron/electron/releases/tag/v45.0.0); [PR #51563](https://github.com/electron/electron/pull/51563)
- From the API docs:
  - Until `configureWebAuthn` is called, `isUserVerifyingPlatformAuthenticatorAvailable()` resolves false.
  - `touchID` requires a `keychain-access-groups` entitlement.
  - `platformPasskeys` presents "the system credential provider sheet (iCloud Keychain, 1Password, Bitwarden, etc.)". It requires the provisioning-profile-backed `com.apple.developer.associated-domains` entitlement with `webcredentials:<domain>`, plus an AASA file on that domain.
  - "The relying party ID of each request [must match] that associated domain", and "platform passkeys always require a real associated domain".
  - Platform passkeys cannot serve cross-origin iframe requests. `prf` and `largeBlob` are unsupported.

  — [electron/docs/api/app.md](https://github.com/electron/electron/blob/main/docs/api/app.md)
- The Electron docs do not mention Apple's web-browser passkey entitlement (`com.apple.developer.web-browser.public-key-credential`) (grep of app.md, 2026-10-22). — [app.md](https://github.com/electron/electron/blob/main/docs/api/app.md)
- Known WebAuthn gaps and bugs in 2026:
  - Passkeys created in non-persistent (private) sessions with Touch ID become orphaned keychain items after restart (#52302, open).
  - Hybrid (phone/QR) transport is not exposed yet (PR #53733, open).
  - Security keys needing a PIN crashed, and are now rejected (fixed Sept 2026).
  - The Windows passkey picker omits Bitwarden (#55087).
  - The long-standing "WebAuthn FIDO/FIDO2 Support" issue #24573 is still open.

  — [#52302](https://github.com/electron/electron/issues/52302); [#53733](https://github.com/electron/electron/pull/53733); [#54371 in v45 notes](https://github.com/electron/electron/releases/tag/v45.0.0); [#55087](https://github.com/electron/electron/issues/55087); [#24573](https://github.com/electron/electron/issues/24573)
- **Password AutoFill:** "On macOS, standard HTML username/password fields in an Electron application do not appear to participate in the system Password AutoFill experience." Tested with 1Password as the macOS AutoFill provider: Safari offered it, Electron did not. Open feature request. — [electron#54142](https://github.com/electron/electron/issues/54142) (2026-09-20)
- **Flow Browser:** uses a third-party `electron-webauthn` (^1.3.1) package. It merged "macOS Passkeys Support" (#148, 2025-07) and "conditional passkey autofill on macOS" (#255, 2026-04). An open issue says "Google Passkey doesn't popup" (#280, 2026-07-17). — [package.json](https://github.com/multiboxlabs/flow-browser/blob/main/package.json); [#148](https://github.com/multiboxlabs/flow-browser/pull/148); [#255](https://github.com/multiboxlabs/flow-browser/pull/255); [#280](https://github.com/multiboxlabs/flow-browser/issues/280)
- **CEF Chrome password manager:** CEF's Chrome page-action enum includes `CEF_CPAIT_MANAGE_PASSWORDS` and `CEF_CPAIT_SAVE_AUTOFILL_ADDRESS`, i.e. Chrome's password and autofill UI exist in Chrome style. A CEF 127 report notes "Password Manager does work fine if opened directly `chrome://password-manager`". — [cef_types.h](https://github.com/chromiumembedded/cef/blob/master/include/internal/cef_types.h); [cef#3763](https://github.com/chromiumembedded/cef/issues/3763)
- **Mori:** after leaving CEF, Mori (a Chromium overlay) lists "Native passkey auth" and committed "Add native browser actions and passkey support" (2026-07-08). — [Mori README](https://github.com/FujiwaraChoki/mori-browser); [commits](https://github.com/FujiwaraChoki/mori-browser/commits)

### Inferences
- For arbitrary sites, Electron can offer only device-bound Touch ID passkeys, which don't sync and aren't visible in iCloud Keychain or 1Password. The synced passkey experience that Safari and Chrome on macOS offer is not available via Electron's `platformPasskeys`, because it is RP-allowlisted by Associated Domains. Closing that gap would likely require native code using Apple's browser passkey APIs and entitlement. This is unverified.
- Password filling in an Electron browser = extensions (with the breakage noted in section 1) or a custom vault. Neither Chrome's password manager nor macOS AutoFill is available.

### Gaps
- Whether Apple grants the web-browser passkey entitlement to Electron or CEF apps, and whether anyone has wired it into Electron, was not found.
- Arc's own passkey behaviour (Chrome-profile vs iCloud Keychain) was not verified.

## 5. Existing Electron-based browsers and how they fared

### Takeaway
No Electron browser has reached Arc-level polish or compatibility. Wexond is archived. Min survives as a minimalist niche browser (9.2k stars, active). The most Arc-like Electron attempt, Flow Browser (ECS + forked electron-chrome-extensions), shows the same pain points: ad blockers, Bitwarden, passkeys, tab memory and security questions. Its public repo has had no push since May 2026.

### Cited Findings
- **Wexond / browser-base** ("Modern and feature-rich web browser base based on Electron"): archived. Last release v5.2.0 (2021-02-17), last push 2023-06-04. — [wexond/browser-base](https://github.com/wexond/browser-base)
- **Min:** 9,220 stars, v1.35.7 released 2026-08-23, last push 2026-08-30. It still has open issues on Google sign-in and 1Password autofill. — [minbrowser/min](https://github.com/minbrowser/min); [min#2306](https://github.com/minbrowser/min/issues/2306); [min#2151](https://github.com/minbrowser/min/issues/2151)
- **Flow Browser (multiboxlabs):** described as "A modern, privacy-focused browser with a minimalistic design" (1,082 stars). Last release v0.12.1 (2026-04-16), last push 2026-05-30. Stack: castLabs ECS v41.1.1, `@iamevan` forks of electron-chrome-extensions and electron-chrome-web-store, and electron-webauthn. — [flow-browser](https://github.com/multiboxlabs/flow-browser); [package.json](https://github.com/multiboxlabs/flow-browser/blob/main/package.json)
- Flow's developer on memory (2025-05-31): "tabs are unloaded by navigating to `about:blank?sleep=true`. However, this method still consumes a bit of memory". A user relayed Theo's concern that Electron lacks built-in sandboxing. The developer said sandbox is enabled for all web pages. — [flow-browser#83](https://github.com/multiboxlabs/flow-browser/issues/83)
- Electron has no API to discard a WebContents. The feature request has been open since 2023. — [electron#38278](https://github.com/electron/electron/issues/38278)
- **electron-browser-shell:** described as "A minimal browser shell built on Electron" (740 stars). It is a reference shell, not a product. — [repo](https://github.com/samuelmaddock/electron-browser-shell)

### Inferences
- The Electron browsers that survive are minimalist (Min) or still pre-1.0 (Flow). None demonstrates Arc-class extension and password-manager compatibility.
- Without Chrome's tab discarding / Memory Saver, an Electron browser has to build its own tab sleeping (Flow's about:blank hack). Arc users take Chrome-style tab management for granted.

### Gaps
- Colloquial: no repo found at `Colloquial/colloquial` (404); its status is unverified.
- Shift, Sidekick and other commercial Electron or Chromium browsers: status and engine for 2025-2026 not verified. The search returned nothing usable.
- No 2025-2026 Hacker News or Reddit thread specifically benchmarking an Electron browser was found.

## 6. CEF: Chrome style vs Alloy style, macOS embedding constraints, extensions/Web Store/toolbar, CEF-based browsers (Mori)

### Takeaway
All of the user's premises check out in CEF's own headers. On macOS, giving CEF a parent NSView (`SetAsChild`/`parent_view`) forces Alloy style. Chrome style requires the Views framework (CefWindow/CefBrowserView), and a Chrome-style window can host at most one Chrome-style BrowserView.

Alloy style gets RequestContext-level extension behaviour but no Chrome extension UI or `chrome://extensions`. Chrome style gets Chrome's real extension system, managed via `chrome://extensions` and policy. CEF has no programmatic extension-management API, and I found no confirmation that Web Store installs or extension action buttons work with the toolbar hidden.

Mori is a concrete example: it built on CEF 148 with parent NSViews (Alloy), had to hand-roll extension behaviour, and two weeks after open-sourcing moved to an ungoogled-chromium overlay.

### Cited Findings
- CEF's runtime-style header says:
  - "Chrome style provides the full Chrome UI and browser functionality whereas Alloy style provides less default browser functionality but adds additional client callbacks and support for windowless (off-screen) rendering."
  - "Windowless rendering will always use Alloy style."
  - "Alloy style Windows with the Views framework can host only Alloy style BrowserViews but Chrome style Windows can host both style BrowserViews. Additionally, a Chrome style Window can host at most one Chrome style BrowserView but potentially multiple Alloy style BrowserViews."

  — [include/internal/cef_types_runtime.h](https://github.com/chromiumembedded/cef/blob/master/include/internal/cef_types_runtime.h)
- macOS-specific: "Alloy style will always be used if |windowless_rendering_enabled| is true **or if |parent_view| is provided**." — [cef_types_mac.h](https://github.com/chromiumembedded/cef/blob/master/include/internal/cef_types_mac.h). Windows forces Alloy only for windowless rendering. — [cef_types_win.h](https://github.com/chromiumembedded/cef/blob/master/include/internal/cef_types_win.h). The CEF maintainer (2023): "The Windows implementation for this issue [embedded non-Views windows with Chrome runtime] is already complete". The macOS side of issue #3294 is still open. — [cef#3294](https://github.com/chromiumembedded/cef/issues/3294)
- The architecture doc says Chrome runtime "requires use of the Views framework … and does not support off-screen rendering". From M125 (mid-2024), Alloy was split into style plus bootstrap. The Alloy bootstrap was removed in M128, so both styles now run on the Chrome bootstrap. — [CEF architecture.md](https://github.com/chromiumembedded/cef/blob/master/docs/architecture.md) (published at chromiumembedded.github.io/cef/architecture); [cef#3681](https://github.com/chromiumembedded/cef/issues/3681); [cef#3685](https://github.com/chromiumembedded/cef/issues/3685)
- Extensions in Alloy style: "Extension functionality that works at the RequestContext level (like network intercepts, etc) should already work with Alloy style browsers. Extension functionality that requires Chrome UI (like toolbars, etc) will not be supported with Alloy style browsers. You can create a windowed Chrome style browser if you wish to load chrome://extensions." (Marshall Greenblatt, 2024-12-18). An Alloy browser logs "Navigation to chrome://extensions/ is blocked in Alloy-style browser." — [cef#3859](https://github.com/chromiumembedded/cef/issues/3859). In Aug 2026, `chrome.tabs.get` worked against Alloy tabs via a CEF fallback, while `chrome.tabs.update` failed or crashed. — [cef#4255](https://github.com/chromiumembedded/cef/issues/4255); [cef#4256](https://github.com/chromiumembedded/cef/issues/4256)
- Extension management: "Extensions with the Chrome runtime can currently be installed and managed via chrome://extensions and various existing admin mechanisms." Programmatic management (pre-install, silent install, allow/block lists) is an open request. The old CefExtension API "will be removed in #3685" (M128). — [cef#3450](https://github.com/chromiumembedded/cef/issues/3450) (open). The maintainer earlier said: "We won't implement extension-related API at this time", pointing to `--load-extension` and Chrome's on-disk layout. — [cef#3285](https://github.com/chromiumembedded/cef/issues/3285)
- Toolbar API: `CefBrowserViewDelegate::GetChromeToolbarType()` defaults to `CEF_CTT_NONE`. `CefBrowserView::GetChromeToolbar()` is "Only supported when using Chrome style" and requires a type other than `CEF_CTT_NONE`. The enum is `CEF_CTT_NONE`, `CEF_CTT_NORMAL`, `CEF_CTT_LOCATION`. — [cef_browser_view_delegate.h](https://github.com/chromiumembedded/cef/blob/master/include/views/cef_browser_view_delegate.h); [cef_browser_view.h](https://github.com/chromiumembedded/cef/blob/master/include/views/cef_browser_view.h); [cef_types.h](https://github.com/chromiumembedded/cef/blob/master/include/internal/cef_types.h)
- An open 2026 CEF bug: an extension service-worker fetch sends `Origin: null`. — [cef#4309](https://github.com/chromiumembedded/cef/issues/4309) (2026-10-12)
- **Mori, CEF era (open-sourced 2026-05-31):**
  - Its README described "SwiftUI + AppKit chrome wrapping a real Chromium engine via CEF … CEF 148 / Chromium 148", with `MoriBrowserView : NSView, hosts one CEF browser per tab`.
  - The README claimed targets including MV3, declarativeNetRequest/webRequest, native messaging and "CRX/Web Store install", verified by a custom smoke test.

  — [Mori README at CEF commit 6f999a2](https://github.com/FujiwaraChoki/mori-browser/blob/6f999a2403ae2bb514017e98838939aa8cafdbaf/README.md)
- Mori's own source comment: "On macOS a CEF browser created with parent_view/SetAsChild uses the Alloy runtime … Chrome's built-in extension runtime is therefore not available on this surface; extension behavior must be implemented by Mori itself (see BrowserClient's content-script injection path)." — [MoriBrowserView.mm at 6f999a2](https://github.com/FujiwaraChoki/mori-browser/blob/6f999a2403ae2bb514017e98838939aa8cafdbaf/Sources/Bridge/MoriBrowserView.mm)
- **Mori's migration:**
  - The "Migrate Mori to Chromium overlay" commit (2026-06-14) has no explanatory body.
  - BUILDING.md: "This repository now contains the Mori browser work on top of ungoogled-chromium instead of the old CEF app."
  - The current README says: "Mori is **not** a fork of Chromium's UI and **not** a CEF app … a custom SwiftUI + Objective-C++ chrome compiled *into* the `chrome` target of an ungoogled-chromium checkout", which leaves extensions and permissions to "Chromium's production browser stack".
  - The repo has 141 stars, release 2.0.5 (2026-07-08) and was last pushed 2026-10-21.

  — [commits](https://github.com/FujiwaraChoki/mori-browser/commits); [BUILDING.md](https://github.com/FujiwaraChoki/mori-browser/blob/main/BUILDING.md); [README](https://github.com/FujiwaraChoki/mori-browser)

### Inferences
- For a SwiftUI/AppKit Arc-style shell that puts web content in its own NSViews, CEF on macOS means Alloy style. That rules out Chrome's extension UI, `chrome://extensions` and Chrome's password manager UI in those views. The only Chrome-style route is a CEF Views CefWindow with one Chrome-style BrowserView per window, which fights a custom AppKit sidebar-and-tabs layout.
- Mori's CEF code comment, together with its switch two weeks later to compiling custom UI into Chromium's `chrome` target, is the strongest available evidence that CEF on macOS doesn't fit an Arc-like browser. The commit itself states no reason, so this is an inference.
- My unverified expectation: with `CEF_CTT_NONE` there is no Chrome toolbar and so no extensions container or puzzle menu, and extension action popups (which anchor to toolbar buttons) would have no UI entry point. CEF exposes no API to trigger them.

### Gaps
- Not confirmed whether chromewebstore.google.com's "Add to Chrome" works in CEF Chrome style (no primary source found), or whether extension action icons appear with `CEF_CTT_LOCATION`. A cefclient test (`--use-views`, Chrome style, toolbar types) would settle both.
- CEF 156 build availability was not verified.
- No other notable macOS CEF-based general-purpose browsers were identified in this pass.

## 7. Performance, memory and battery: Electron vs Chrome/Arc

### Takeaway
I found no rigorous, sourced browser-workload benchmark of an Electron browser against Chrome or Arc. Electron uses the same multi-process Chromium content layer, so per-tab costs should be similar, plus a Node-enabled main process and app UI. It lacks Chrome-layer features such as tab discarding and Memory Saver, so whole-browser memory over long sessions likely depends on custom engineering. Arc's own memory and battery reputation is mixed, roughly Chrome-like.

### Cited Findings
- A measurement in a Tauri issue argues that common benchmarks overstate Electron by ignoring shared memory. One user measured Electron at 337 MB on macOS vs Chrome at 381 MB for postman.com. This is a single-user measurement of an app, not a browser workload. — [tauri-apps/tauri#5889](https://github.com/tauri-apps/tauri/issues/5889)
- Electron has no API to discard a WebContents (open since 2023). — [electron#38278](https://github.com/electron/electron/issues/38278). Flow Browser sleeps tabs by navigating to `about:blank?sleep=true`, which "still consumes a bit of memory". — [flow-browser#83](https://github.com/multiboxlabs/flow-browser/issues/83) (2025-05-31)
- electron-chrome-extensions makes all extension background scripts persistent ("All background scripts are persistent"). — [README](https://github.com/samuelmaddock/electron-browser-shell/blob/master/packages/electron-chrome-extensions/README.md). One open report says uBlock's "Local Extension Settings" folder "grows exponentially (10GB +)". — [#158](https://github.com/samuelmaddock/electron-browser-shell/issues/158)
- Reviews of Arc's own memory use conflict. Techpp found resource usage "very similar to that of Chrome". TechRepublic measured Chrome ~660 MB vs Arc ~320 MB with the same tabs, with unclear methodology. Android Authority said Chrome is "just as bad, if not worse" on battery than Arc, with Edge more efficient. — [techpp](https://techpp.com/?p=243076); [TechRepublic](https://www.techrepublic.com/es/article/arc-browser-review/); [Android Authority](https://www.androidauthority.com/google-chrome-vs-arc-browser-3559939)
- Context (vendor blogs, possibly slanted): Arc went into maintenance mode (security and Chromium updates only) on 2025-05-27, and Atlassian acquired The Browser Company (announced Sept 2025). — [SupaSidebar status tracker](https://supasidebar.com/blog/arc-browser-status-tracker); [SuperchargeBrowser](https://www.superchargebrowser.com/library/arc-browser-status-2026/)

### Inferences
- An Electron browser's per-tab cost should be roughly Chromium's. The risks are on top of that: no native tab discarding or Memory Saver, persistent extension background pages (worse than MV3's ephemeral workers in Chrome), and a JS main process that drives UI and IPC for every tab. All three push the long-session footprint above Chrome or Arc unless engineered around.
- The ECS version lag (section 2) also delays Chromium performance and energy fixes.

### Gaps
- No measured Electron-browser vs Chrome/Arc battery (Energy Impact) data was found.
- No HN or Reddit thread with numbers for Flow or Min vs Chrome was found.
- Arc measurements come from reviews without methodology.
