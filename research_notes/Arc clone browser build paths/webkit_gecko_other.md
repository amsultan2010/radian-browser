# Non-Chromium engine paths (WebKit/WKWebView, Gecko, Servo/Ladybird) for an Arc-identical macOS browser — as of 22 Oct 2026

Research date: 2026-10-22. GitHub numbers were pulled live with `gh api` on that date. "Unverified" means a single secondary source or none.

## 1. Swift + WKWebView Arc alternatives: which exist, how Arc-like, how alive

### Takeaway
Nook (`nook-browser/Nook`, GPL-3.0) is the only Swift/WKWebView Arc clone that is both active and close to Arc's feature set in October 2026. It shipped four releases between 6 and 13 Oct 2026, has 84 commits in the last 30 days, and has Arc's vocabulary: spaces, favorites, pinned section, folders, live folders, Peek, split view, command bar, a mini window for outside links, and "Air Traffic Control". Ora (GPL-3.0) has stalled and says it is not ready for daily use. Aura is archived. Nothing credible called "Yab" turned up.

### Cited Findings
- **Nook repo facts (22 Oct 2026):** `nook-browser/Nook` is described as "A new browser, not owned by Atlassian". It is GPL-3.0 and written in Swift, with 1,965 stars and 78 forks. It was created 2025-08-01 and last pushed 2026-10-19. Its latest releases are v1.2.3 (2026-10-13), v1.2.2 (2026-10-11) and v1.2.1 (2026-10-08). There were 84 commits since 2026-09-22. — [GitHub API: nook-browser/Nook](https://github.com/nook-browser/Nook)
- **Nook's canonical repo and maintainer:** The project's own CLAUDE.md says `nook-browser/Nook` is the canonical repo and Bain Gurley has maintained it since September 2026. It says the project "ran as the fork `l984-451/Nook` from March to September 2026 and that fork is archived." The README says "Development started back up in September 2026 under a new maintainer." — [Nook CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/CLAUDE.md), [Nook README](https://github.com/nook-browser/Nook)
- **Nook license:** "With the exception of third-party libraries in Nook/ThirdParty, all code is under the GPL 3.0 License." — [Nook README](https://github.com/nook-browser/Nook)
- **Nook requirements:** macOS 26.0 (Tahoe) or later on Apple Silicon, and Xcode 26 or later. It is Apple Silicon only because "the on-device tab organizer depends on MLX". The minimum OS was raised from 15.5 to 26.0 in September 2026. The app is not sandboxed and runs with hardened runtime. — [Nook README](https://github.com/nook-browser/Nook), [Nook CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/CLAUDE.md)
- **Nook's Arc-equivalent features, from its own architecture docs (Oct 2026):**
  - ExtensionManager (WKWebExtension), PeekManager ("Quick preview overlay"), SplitViewManager, a CommandPalette, and an AIManager with an MCP client.
  - TabOrganizerManager does on-device LLM tab grouping, much like Arc's "Tidy Tabs".
  - ExternalMiniWindowManager gives "mini browser windows for a link from another app and for a sign-in popup", which works like Little Arc.
  - Spaces each have favorites, a pinned section and a tabs section. Tabs nest in folders.
  - "Trails" make a tab opened from a page that tab's child.
  - Background tabs are unloaded on idle or memory pressure, like sleeping tabs.
  - NookTweaks holds site tweaks for YouTube, Facebook and SponsorBlock.
  - NookBlocker is built-in ad blocking via adblock-rust.
  - Sources: [Nook README](https://github.com/nook-browser/Nook), [Nook CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/CLAUDE.md)
- **Nook release notes (Oct 2026):**
  - v1.2.3 (2026-10-13) added a "Pull Requests live folder for GitHub". Its "Air Traffic Control rules cover subdomains", and it changed "Command bar: top row is what Return does".
  - v1.2.2 (2026-10-11) claims "Faster Launch (up to 3x faster in testing)" and a "Performance pass: memory, CPU and energy measured against other browsers".
  - v1.2.1 (2026-10-08) "Removed LiquidGlass styling".
  - v1.2.0 (2026-10-06) added "Sleeping tabs keep history" and fixed "Password managers not working in Peek and mini".
  - Source: [Nook releases](https://github.com/nook-browser/Nook/releases)
- **Nook profiles differ from Arc's:** "Each space owns a unique `WKWebsiteDataStore` … Two spaces cannot share a login." Arc lets several spaces share one profile. — [Nook CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/CLAUDE.md)
- **How others describe Nook (late 2025):** Product Hunt called it "very similar to Arc". An AlternativeTo commenter called it "a 1:1 clone of arc browser?". Another said it "looks extremely similar to Zen Browser". — [AlternativeTo: Nook](https://alternativeto.net/software/nook-browser/about), [Product Hunt: Nook](https://www.producthunt.com/products/nook-an-open-source-arc-alternative)
- **Ora repo facts (22 Oct 2026):** `the-ora/browser` is GPL-3.0 Swift with 2,241 stars. It was last pushed 2026-09-17. Its last release was v0.2.14 on 2026-04-07. It had one commit in the 60 days before 22 Oct 2026. The README says "Ora is still in active development and is not ready for daily use yet." — [GitHub: the-ora/browser](https://github.com/the-ora/browser)
- **Ora features (roadmap updated March 2026):** Available today are "Spaces, tab pinning and reordering, floating tab switching, and inactive tab cleanup; Vertical tabs, picture in picture; Session restore, private browsing, and iCloud Keychain password autofill". Still listed as near-term: split view, passkeys, folders, "Browser extension support in beta", and history. A code search of the repo for `WKWebExtension` returned 0 hits. — [Ora ROADMAP.md](https://github.com/the-ora/browser/blob/main/ROADMAP.md)
- **Aura:** `doorhinge-apps/Aura-Browser` is "an open source alternative for Arc browser" for iOS, iPadOS, macOS and visionOS. It is MPL-2.0 with 197 stars, and is **archived**, with its last push on 2025-06-19. — [GitHub: Aura-Browser](https://github.com/doorhinge-apps/Aura-Browser)
- **Refrax:** `kageroumado/refrax-browser` is a GPL-3.0 "maximalist browser" by one person. It has 48 stars and was last pushed 2026-10-22. Whether it has Arc-style spaces was not checked. — [GitHub: refrax-browser](https://github.com/kageroumado/refrax-browser)
- **"Yab":** The only match was `lucaArchidiacono/yab` ("yet another browser"), with 0 stars and a last push of 2025-10-28. — [GitHub: yab](https://github.com/lucaArchidiacono/yab)

### Inferences
- Nook is the best WebKit base by a wide margin. It is the only candidate with active development, Arc-like UX already built, working WKWebExtension support, and an architecture document detailed enough to fork from.
- GPL-3.0 (Nook and Ora) means a fork must also be distributed under GPL-3.0. That is fine for a personal or open-source build, but rules out a closed-source product.
- Some of Arc's features still have no confirmed Nook equivalent: Boosts (user-written CSS/JS per site), Archive (auto-archiving old tabs into a searchable list), Easels/Notes, and Arc Sync across Macs. NookTweaks and tab unloading are only partial stand-ins.
- Nook has had a maintainer gap before (March to September 2026). Bus-factor risk is real.

### Gaps
- I did not confirm whether Nook has an Arc-style Archive view, Boosts, theme-per-space gradients, or cross-device sync.
- I found no hands-on review of Nook 1.2.x. Feature claims come from the project's own docs and release notes.
- "Yab" may refer to a project not on GitHub. I found nothing credible.

## 2. WKWebView platform limits: extensions, DRM, passkeys, autofill, Google sign-in, site compatibility, battery

### Takeaway
Since macOS 15.4, any WKWebView app can host WebExtensions through `WKWebExtension`/`WKWebExtensionController`. Nook installs Chrome Web Store CRX packages directly, with no converter. Fidelity is a WebKit subset, though: blocking `webRequest` is missing, and some Chrome behaviours need polyfills.

The hard gaps are these:
- **System passkeys / iCloud Keychain passkeys:** Apple gates them behind an entitlement it declined for Nook.
- **Password autofill:** apps get only their own Keychain items or an extension, not Apple Passwords.
- **Netflix/DRM:** probably FairPlay through WebKit, but no source confirms Netflix works in a third-party native WKWebView app.
- **Battery:** the idea that WebKit is more efficient is not supported by recent Apple-silicon measurements.

### Cited Findings
**Extensions**
- `WKWebExtension` is available on macOS 15.4+, iOS/iPadOS/Mac Catalyst 18.4+ and visionOS 2.4+. Apple describes it as "An object that encapsulates a web extension's resources that the manifest file defines." — [Apple: WKWebExtension (doc JSON)](https://developer.apple.com/documentation/webkit/wkwebextension)
- `WKWebExtensionController` "manages a set of loaded extension contexts". It is attached through the `webExtensionController` property on `WKWebViewConfiguration`. A delegate handles permission prompts. — [Apple: WKWebExtensionController](https://developer.apple.com/documentation/webkit/wkwebextensioncontroller)
- Nook's extension system (Oct 2026):
  - It installs `.zip`, `.xpi`, `.crx` ("header stripped, signature not checked"), `.appex` Safari extension bundles, and `.app` bundles.
  - It has "Add to Nook" buttons on the Chrome Web Store, Edge add-ons and addons.mozilla.org, with a daily update check.
  - Content scripts need macOS 15.5+.
  - Source: [Nook ExtensionManager/CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/Nook/Managers/ExtensionManager/CLAUDE.md)
- Nook's known incompatibilities:
  - "WebKit ignores Firefox-only permissions (`webRequestBlocking`, `contextualIdentities`)… so a Firefox build of uBlock Origin installs but cannot block requests."
  - Sites calling `runtime.sendMessage(SAFARI_EXT_ID…)` (`externally_connectable`) need a Nook-written polyfill, "because Safari extension IDs don't match WKWebExtension IDs".
  - Bitwarden's biometric unlock needed a custom in-process native-messaging host.
  - Tab webviews must derive their config from the same `WKWebViewConfiguration` the controller uses.
  - Source: [Nook ExtensionManager/CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/Nook/Managers/ExtensionManager/CLAUDE.md)
- Safari's declarativeNetRequest differs from Chrome's. Custom request headers via `modifyHeaders` are reported not applied. Regex-substitution redirects are unsupported. Disabling content blockers also disables DNR redirects (WebKit bug, Safari 26.1, Dec 2025). Reports on `webRequestBlocking` under MV3 conflict. — [Apple Dev Forums 778587](https://developer.apple.com/forums/thread/778587), [WebKit bug 303800](https://bugs.webkit.org/show_bug.cgi?id=303800), [Apple Dev Forums 702362](https://developer.apple.com/forums/thread/702362)
- A late-2025 secondary report (FeedBagel, summarising Hacker News) says Nook "supports both Chrome and Safari extensions". — [FeedBagel](https://feedbagel.com/post/nook-new-open-source-webkit-browser-for-mac-focused-on-speed-and-user-experience)

**Passkeys and autofill**
- Nook (Oct 2026): "System passkeys are not supported; extension passkeys work."
  - Apple declined the `com.apple.developer.web-browser.public-key-credential` entitlement, so "iCloud Keychain passkeys are unreachable".
  - Nook stubs `isUserVerifyingPlatformAuthenticatorAvailable` to false.
  - Bitwarden and 1Password extensions replace `navigator.credentials` on the page, so passkey logins do succeed for users of those extensions.
  - Source: [Nook CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/CLAUDE.md)
- Apple DTS (forum): the browser passkey entitlement has a dedicated request form, and only the Account Holder role can submit it. A developer reports authorization errors in a macOS WKWebView browser without it. — [Apple Dev Forums 829169](https://developer.apple.com/forums/thread/829169), [Apple Dev Forums 774904](https://developer.apple.com/forums/thread/774904)
- Without the browser entitlement, a WKWebView app can only use passkeys for relying parties in its own associated domains. — [Apple: Supporting passkeys](https://developer.apple.com/documentation/authenticationservices/supporting-passkeys), [passkeys.dev iOS reference](https://passkeys.dev/docs/reference/ios)
- Nook's entitlements file includes `com.apple.developer.authentication-services.autofill-credential-provider`. However, "Release DMGs therefore lack push and autofill entitlements", because CI signs with a reduced file. — [Nook.entitlements](https://github.com/nook-browser/Nook/blob/develop/Nook/Nook.entitlements), [Nook CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/CLAUDE.md)
- Ora's advertised "iCloud Keychain password autofill" is built on its own `kSecClassGenericPassword` Keychain items, stored with `SecItemAdd`/`SecItemCopyMatching` in `PasswordManagerService.swift`. — [Ora PasswordManagerService.swift](https://github.com/the-ora/browser/blob/main/ora/Features/Passwords/Services/PasswordManagerService.swift)
- Ora passkey issues #92 (2025-09-15) and #168 (2025-10-29) are closed, yet the March 2026 roadmap still lists passkeys as near-term. — [Ora issue #168](https://github.com/the-ora/browser/issues/168), [Ora ROADMAP](https://github.com/the-ora/browser/blob/main/ROADMAP.md)

**Google sign-in**
- Google blocks OAuth from embedded user agents with `disallowed_useragent`, enforced from 24 July 2023, and names WKWebView on iOS/macOS as an example. — [Auth0 support article](https://support.auth0.com/center/s/article/disallowed-useragent-403-with-Google-sign-in), [Terra docs](https://docs.tryterra.co/faq/help-topics/data-api-sdk/mobile-sdk-setup-permissions-and-crashes/google-oauth-blocked-in-webview)
- Nook has an `OAuthDetector` that exempts OAuth flows from ad blocking and routes sign-in popups into real WebKit popup windows "so `window.opener` survives". A Sept 2026 security PR touched "auth". — [Nook CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/CLAUDE.md), [Nook PR #361](https://github.com/nook-browser/Nook/pull/361)

**DRM**
- Nook issue #263, "DRM for Netflix and others" (2025-11-23), was closed. A contributor commented: "we don't need a DRM license since we're just wrapping webkit, so we already have FairPlay built in." A second contributor agreed (2026-02-14). No test result was posted. — [Nook issue #263](https://github.com/nook-browser/Nook/issues/263)
- WebKit bug 284841 (Dec 2024): **Mac Catalyst** WKWebView does not expose FairPlay EME, though it works in iOS WKWebView and macOS Safari. It says nothing about native AppKit WKWebView. — [WebKit bug 284841](https://bugs.webkit.org/show_bug.cgi?id=284841)
- Orion, a WebKit-based browser, had a long user thread about Netflix/HBO Max stream errors, with inconsistent fixes across builds. — [Orion feedback thread 2785](https://orionfeedback.org/d/2785-netflix-stream-error)
- Safari on macOS can reach 4K on Netflix because Apple's DRM is hardware-backed, while other browsers are capped lower (Genbeta, secondary). — [Genbeta](https://www.genbeta.com/multimedia/esta-razon-que-ver-netflix-chrome-firefox-error-mejora-calidad-visualizacion-usando-otro-navegador)

**Site compatibility**
- Nook needed WebKit-embedding fixes such as "Fix blurry Google Docs: report a window frame so window.outerWidth is not 0" (PR #366, Sept 2026). It also has site "Tweaks" for YouTube and X ("YouTube detecting ad blocker", "X hiding posts with videos", fixed in v1.2.0). — [Nook PR #366](https://github.com/nook-browser/Nook/pull/366), [Nook releases](https://github.com/nook-browser/Nook/releases)

**Battery and memory**
- Matt Birchler, 22 Jun 2025, M4 Pro MacBook Pro on the macOS Tahoe beta: after 5 hours of scripted browsing, battery remaining was Safari 61%, Arc 67%, Zen 68%. Each browser was run twice with "very consistent" results. He calls it "not a scientific test bench". — [Birchtree](https://birchtree.me/blog/seriously-use-the-browser-you-like-dont-worry-about-battery/)
- Birchler's 2024 test (M2 Pro, 36 hours): "Safari burned through battery about 7% faster than Chrome." — [Birchtree 2024](https://birchtree.me/blog/everyone-says-chrome-devastates-mac-battery-life-but-does-it-i-tested-for-36-hours-to-find-out/)
- The often-cited "Safari wins" figures come from a 2015 Intel MacBook Pro test: Safari 6h21m, Firefox 5h29m, Chrome 5h08m. — [BetaNews 2015](https://betanews.com/2015/08/06/dump-google-chrome-to-extend-your-macbooks-battery-life/)
- Nook's stated priorities include "Battery and CPU balance: no polling timers… prefer notifications and WebKit callbacks". It documents measuring per-process energy via `proc_pid_rusage` (`ri_energy_nj`). — [Nook CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/CLAUDE.md)

### Inferences
- "Safari Web Extensions only work in Safari" is no longer true on macOS 15.4+. A WKWebView app can load the same WebExtension bundles and Chrome CRX files directly, which Nook does. You do not need Apple's `safari-web-extension-converter` for a WKWebView host app. Each extension's fidelity still depends on WebKit's API coverage. MV3 extensions built on DNR work best, and anything needing blocking `webRequest` (classic uBlock Origin) does not.
- **Passkeys are the single biggest WebKit gap versus Arc.** Arc (Chromium) can use iCloud Keychain passkeys natively on macOS. A third-party WKWebView browser needs an Apple entitlement that Apple has declined at least once (Nook). The workaround is a password-manager extension.
- **Apple Passwords / iCloud Keychain autofill:** neither project shows a way to read the user's existing Safari passwords. Ora stores its own entries. A user who relies on Apple Passwords would fall back to the Passwords app or its extension (not verified here).
- **Netflix:** FairPlay EME probably works in native macOS WKWebView, because Safari is a WKWebView-family client and the only known bug is Catalyst-specific. Treat it as **unverified** until tested on bitmovin.com/demos/drm or Netflix itself.
- **Battery:** on Apple silicon in 2024–2025, Safari/WebKit showed no measurable advantage over Chromium (Arc/Chrome) or Gecko (Zen). Battery should not be the reason to pick WebKit.

### Gaps
- No primary source confirms Netflix, Disney+ or Prime playback in a third-party native WKWebView browser in 2026.
- No source shows a WKWebView browser that does get the passkey entitlement in 2026, or what Apple's criteria are.
- Google sign-in success rates in Nook and Ora were not verified by test. The policy names WKWebView, but full browsers that send a Safari-like UA usually pass. That last point is unverified.
- No published Nook memory or energy numbers, despite the v1.2.2 "measured against other browsers" note.
- I did not check Apple's `safari-web-extension-converter` documentation for 2026 changes.

## 3. Firefox/Gecko path: Zen Browser, Floorp; build cost, add-ons, DRM, Mac feel

### Takeaway
Zen is the most mature and active Arc-like browser on any non-Chromium engine. It has 45k stars, weekly releases, Firefox 158.0.1 as its base, and modules for spaces, essentials-style pinned tabs, folders, live folders, glance, split view, compact mode, boosts and space routing.

Building it needs at least 30 GB free, above the user's 17 GB. It has no working Widevine DRM for Netflix-class services, because Google has not licensed it. Its UI is Firefox chrome restyled with JS/CSS, not native AppKit/SwiftUI.

### Cited Findings
- **Zen repo facts (22 Oct 2026):** `zen-browser/desktop` is MPL-2.0 with 45,097 stars and 1,873 forks, last pushed 2026-10-22. Recent releases are 1.23.4b (2026-10-21), 1.23.3b (2026-10-16) and 1.23.2b (2026-10-09). The README says Release "is currently built using Firefox version `158.0`", and `surfer.json` pins Firefox 158.0.1. — [GitHub: zen-browser/desktop](https://github.com/zen-browser/desktop)
- **Zen's feature modules** are under `src/zen/`: `spaces`, `space-routing`, `folders`, `live-folders`, `glance`, `split-view`, `compact-mode`, `boosts`, `mods`, `sessionstore`, `sync`, `tabs`, `urlbar`, `kbs`, `media`, `downloads`, `welcome`, `window-drag`. — [GitHub: zen-browser/desktop src/zen](https://github.com/zen-browser/desktop/tree/dev/src/zen)
- **Zen release-note highlights (Neowin):** workspaces, Compact Mode (hides title bar and tabs), Zen Glance, split views (a reviewer split 10+ tabs), vertical tabs and tab folders. 1.16b let you switch spaces by typing the space name in the URL bar. 1.17b added a compact-mode toggle button. — [Neowin Zen 1.16b](https://www.neowin.net/software/zen-browser-116b/), [Neowin Zen 1.17b](https://www.neowin.net/software/zen-browser-117b/), [Neowin Zen 1.19.3b](https://www.neowin.net/amp/zen-browser-1193b/)
- **Zen's stack and toolchain:** it builds with `surfer`, a Firefox-fork tool. `npm run init` runs surfer download, import and bootstrap. `npm run build` runs `surfer build`, and `npm run build:ui` runs `surfer build --ui` for a faster UI-only rebuild. `npm start` runs `./mach run`. — [Zen package.json](https://github.com/zen-browser/desktop/blob/dev/package.json)
- **Zen's build requirements:** "Keep 30GB of free space on the disk". It needs Git, Python 3, Node.js 21+, sccache and Rust/Cargo. For JS-only changes, `npm run build:ui` is faster after the first full build. — [Zen docs: Building](https://docs.zen-browser.app/contribute/desktop/building)
- **Firefox on macOS:** "4GB RAM minimum, 8GB+ recommended" and "At least 30GB of free disk space". — [Mozilla: Building Firefox on macOS](https://firefox-source-docs.mozilla.org/setup/macos_build.html)
- **Firefox artifact builds** download prebuilt C++ components, cutting build time "from 30+ minutes to just 1-2 minutes". They suit developers not changing compiled code. No disk figure is given. — [Mozilla: Understanding Artifact Builds](https://firefox-source-docs.mozilla.org/contributing/build/artifact_builds.html)
- **Zen's macOS mozconfig** contains `ac_add_options --enable-eme=widevine`. A repo search for `enable-artifact-builds` returned 0 hits. — [Zen configs/macos/mozconfig](https://github.com/zen-browser/desktop/blob/dev/configs/macos/mozconfig)
- **Zen DRM:** GitHub discussion #14536 (9 Jul 2026, 0 replies) says DRM is required for Netflix/Prime and "Zen Browser currently lacks this… While Zen waits for license approval from Google". Neowin release write-ups repeat that Zen lacks DRM because it has no Widevine license. — [Zen discussion #14536](https://github.com/zen-browser/desktop/discussions/14536), [Neowin Zen 1.19.8b](https://www.neowin.net/amp/zen-browser-1197b/)
- **Widevine licensing:** it needs a Widevine Master License Agreement with Google, a registered company, and robustness/certification steps. The licence itself is free. — [Nook issue #263, which quotes the process](https://github.com/nook-browser/Nook/issues/263) (secondary; Google's own page is [Widevine overview](https://developers.google.com/widevine/drm/overview))
- **Floorp (22 Oct 2026):** `Floorp-Projects/Floorp`, "Floorp 12", is MPL-2.0 with 8,456 stars, last pushed 2026-10-22, latest release v12.20.2 (2026-10-17). It is "Based on Mozilla Firefox". — [GitHub: Floorp](https://github.com/Floorp-Projects/Floorp)
- **Battery:** in Birchler's June 2025 test, Zen kept 68% after 5 hours versus Arc's 67%. — [Birchtree](https://birchtree.me/blog/seriously-use-the-browser-you-like-dont-worry-about-battery/)

### Inferences
- **Feature parity:** Zen is the closest to Arc of any non-Chromium browser: spaces, essentials, folders, live folders, glance (Peek), split view, compact mode (Arc's hidden sidebar), and boosts. But it feels like Firefox: XUL/HTML chrome, Firefox menus and Firefox settings pages. A Swift/SwiftUI app like Nook (or Arc, which is Swift on Chromium) feels more native on macOS.
- **Extensions:** Zen takes Firefox add-ons from AMO only. Chrome-only extensions are unavailable unless the author ships a Firefox build. Firefox keeps blocking `webRequest`, so uBlock Origin works fully. That is an advantage over WebKit.
- **Building with 17 GB free:** a full Zen/Firefox build needs 30 GB, so it is not feasible without freeing about 13 GB or more or using an external SSD. Artifact builds could cut compile time, but Zen's tooling does not enable them and no disk figure is published. A UI-only Zen fork is possible after one full build.
- **Alternative to building:** use the Zen binary and customise it through Zen Mods and `userChrome.css` (the `src/zen/mods` module exists). That needs no compile, but cannot change engine behaviour.
- **DRM:** for Netflix and Disney+ at full quality, Zen (and any unlicensed Gecko fork) is weaker than both Arc (Chromium with Widevine) and WebKit (FairPlay, if it works in WKWebView).

### Gaps
- No primary Zen statement (docs FAQ) on DRM status in October 2026.
- Whether Zen's macOS build supports iCloud Keychain passkeys was not checked. Firefox on macOS has a platform-authenticator path, but that is unverified here.
- No measured disk usage for a Firefox artifact build on macOS.
- Floorp's Arc-like features (workspaces, vertical tabs, split view) were not checked against primary docs.

## 4. Newer engines, embeddable Chromium options, and Arc/Dia/ADK status

### Takeaway
Servo and Ladybird are not usable for daily browsing in October 2026. Servo ships "Tech Demo" builds, at v0.7.0 on 5 Oct 2026, and Ladybird has not shipped its first alpha. The Browser Company now belongs to Atlassian ($610M, closed Oct 2025) and is moving Arc features into the proprietary Chromium-based Dia. Arc and its ADK have not been open-sourced as far as any source shows.

### Cited Findings
- **Servo:** `servo/servo` (MPL-2.0, 38,213 stars) released v0.7.0 on 2026-10-05, v0.6.0 on 2026-09-29 and v0.1.3 on 2026-08-22. Release notes call the download "the Servo Tech Demo". — [GitHub: servo v0.7.0](https://github.com/servo/servo/releases/tag/v0.7.0)
- Phoronix (Servo 0.3) said servoshell "still isn't featureful enough for any daily usage". With Servo 0.4 (31 Jul 2026), Google Photos newly works, while Google Maps and OpenStreetMap render with interactivity issues. Servo positions itself as an embeddable alternative to CEF. — [Phoronix Servo 0.3](https://www.phoronix.com/news/Servo-0.3-Released), [Phoronix Servo 0.4](https://www.phoronix.com/news/Servo-0.4-Released)
- **Ladybird:** `LadybirdBrowser/ladybird` (BSD-2-Clause, 66,616 stars) has **0 GitHub releases** as of 22 Oct 2026. ladybird.org says: "Our first Alpha for macOS and Linux is coming later this year", "aimed at developers and early adopters". Windows comes later. — [GitHub: Ladybird](https://github.com/LadybirdBrowser/ladybird), [ladybird.org](https://ladybird.org/)
- Wikipedia (via search summary) says Ladybird stopped accepting public PRs from non-maintainers on 5 Jun 2026 ahead of the alpha. This is unverified against a primary source. — [Wikipedia: Ladybird](https://en.wikipedia.org/wiki/Ladybird_(web_browser))
- **CEF:** the Chromium Embedded Framework ships prebuilt "Standard Distribution" binaries for macOS arm64, so no Chromium compile is needed. A wrapper only builds `libcef_dll_wrapper`. Without helper bundles it falls back to an unsupported single-process mode. — [webview_cef (pub.dev)](https://pub.dev/packages/webview_cef)
- **Atlassian deal:** Atlassian bought The Browser Company for US$610M cash. Completion was 21 Oct 2025 per Wikipedia; one source had expected Q1 2026. — [BetaNews](https://betanews.com/2025/09/05/atlassian-moves-into-ai-browsers-with-610-million-purchase-of-the-browser-company/), [AlternativeTo news](https://alternativeto.net/news/2025/9/atlassian-acquires-the-browser-company-creator-of-the-arc-and-dia-ai-powered-browsers)
- **Dia** is proprietary, Chromium-based and Apple-silicon-only. Its latest listed stable was 1.14.0 on 14 Jan 2026. This comes from a search summary of Wikipedia and is unverified for Oct 2026. — [Wikipedia: Dia](https://en.wikipedia.org/wiki/Dia_(web_browser))
- **TechCrunch, 3 Nov 2025:** "Arc's greatest hits" are coming to Dia, "including things like the sidebar mode". Pinned tabs were in testing and Spaces were being explored. Miller: "Arc was simply too different, with too many new things to learn, for too little reward." — [TechCrunch](https://techcrunch.com/2025/11/03/dias-ai-browser-starts-adding-arcs-greatest-hits-to-its-feature-set)
- **May 2025:** The Browser Company considered selling or open-sourcing Arc. Miller wrote that they "can't do that meaningfully without also open-sourcing ADK", which is also Dia's foundation. — [heise](https://heise.de/-10414231), [mezha.media](https://mezha.media/en/news/the-browser-company-to-sell-or-open-souce-arc-302240)
- A guide updated in June 2026 says no open-source Arc exists and the company has not published Arc's source. — [SupaSidebar](https://supasidebar.com/blog/open-source-arc-browser)

### Inferences
- Neither Servo nor Ladybird can carry an Arc-identical daily browser in 2026, given missing site compatibility, DRM, extensions and passkeys. Revisit Ladybird after its alpha, nominally late 2026.
- CEF prebuilt binaries are a Chromium path that avoids compiling Chromium. That matters for the "cannot compile Chromium" constraint, but it belongs to the Chromium research track.
- Do not plan on Arc or ADK source becoming available. Nothing from June to October 2026 shows it happened.

### Gaps
- No source found on Microsoft WebView2 for macOS. Microsoft documents it as Windows-only as far as I know, but this was not verified in this session.
- I found nothing on a "Chromium as a library" project for macOS in 2026.
- The TechCrunch summary I fetched also called Arc "being wound down and open-sourced". That conflicts with the June 2026 "no open-source Arc" report, and I could not settle it with a primary 2026 Browser Company statement.
- No primary source on Dia's version or features as of October 2026.

## 5. Ranking for the user (M4 MacBook, 16 GB RAM, 17 GB free disk, cannot compile Chromium)

### Takeaway
For "identical to Arc" under these constraints, **forking Nook (Swift + WKWebView) ranks first**. It is the only path that builds within 17 GB, uses Arc's native Swift/AppKit look, and already has most of Arc's interaction model. **Zen (Gecko) ranks second.** It has more complete features and better extension and uBlock fidelity, but it feels like Firefox, cannot be built in 17 GB, and has no Widevine DRM. Servo and Ladybird are not viable. Neither engine path can reach Chromium's site compatibility, and only Chromium paths give Arc's exact extension and passkey behaviour.

### Cited Findings
- Nook builds with Xcode 26+ on macOS 26 on Apple Silicon by opening `Nook.xcodeproj`, with Swift packages resolved by Xcode. — [Nook README](https://github.com/nook-browser/Nook)
- Zen and Firefox need at least 30 GB free to build. — [Zen docs](https://docs.zen-browser.app/contribute/desktop/building), [Mozilla](https://firefox-source-docs.mozilla.org/setup/macos_build.html)
- WebKit gaps: system passkeys need an entitlement Apple declined for Nook; blocking `webRequest` is unsupported. — [Nook CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/CLAUDE.md), [Nook ExtensionManager/CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/Nook/Managers/ExtensionManager/CLAUDE.md)
- Gecko/Zen gap: no Widevine licence. — [Zen discussion #14536](https://github.com/zen-browser/desktop/discussions/14536)
- Battery is a wash on Apple silicon: Safari 61%, Arc 67%, Zen 68% after 5 hours. — [Birchtree](https://birchtree.me/blog/seriously-use-the-browser-you-like-dont-worry-about-battery/)

### Inferences
Scores are relative to Arc: 5 means the same as Arc, 1 means far off.

| Dimension | WebKit (Nook fork) | Gecko (Zen) | Note |
|---|---|---|---|
| Look/feel (native macOS) | 5 | 3 | Nook is SwiftUI/AppKit like Arc. Zen is restyled Firefox chrome. |
| Arc feature set | 4 | 4 | Both have spaces, pinned/favorites, folders, peek/glance and split view. Nook adds a mini window (Little Arc) and Air Traffic Control. Zen adds boosts, compact mode and mods. Archive and Easels are missing or unconfirmed in both. |
| Extensions | 3 | 3 | Nook installs Chrome Web Store CRX files but with a WebKit API subset (no blocking webRequest). Zen offers only Firefox add-ons, with full webRequest. |
| Site compatibility | 3 | 4 | WebKit quirks need per-site fixes (Google Docs outerWidth, YouTube, X). Gecko is less often targeted than Chromium. Neither matches Arc. |
| DRM (Netflix etc.) | 3? | 1–2 | FairPlay in WKWebView is likely but unverified. Zen lacks a Widevine licence. |
| Sign-in / Google | 3? | 4 | Google's policy names WKWebView. Nook has OAuth popup handling. Not tested. |
| Passkeys | 2 | ? | No iCloud Keychain passkeys in Nook; extension passkeys only. Zen's status unchecked. |
| Password autofill | 2–3 | 3 | Neither reads Apple Passwords directly. Use a password-manager extension. |
| Battery/memory | 4 | 4 | Measured parity on M4 Pro (2025). |
| Buildable on 17 GB free | Yes | No (needs 30 GB) | |

**Biggest gaps vs Arc, WebKit path:**
1. iCloud Keychain passkeys (entitlement).
2. Chrome extension fidelity, such as uBO-class blockers and `externally_connectable`.
3. Chromium-only site behaviour.
4. Netflix/DRM is untested.
5. Profiles are tied one-per-space.
6. No Arc Sync equivalent confirmed.
7. GPL-3.0 copyleft.

**Biggest gaps vs Arc, Gecko path:**
1. Cannot build within 17 GB.
2. No Widevine, so no Netflix/Disney+.
3. Firefox-style UI chrome, not native.
4. No Chrome Web Store extensions.
5. Firefox's own sign-in and passkey behaviour (not verified here).

### Gaps
- No side-by-side hands-on test of Nook 1.2.x versus Zen 1.23.x against an Arc feature checklist. Scores above are inferred from docs, code and release notes.
- Xcode 26's install size versus 17 GB free was not checked. If Xcode is not already installed, it may consume much of that space.
