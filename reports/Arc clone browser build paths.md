# Fork Stedding on a rented Mac

Building Radian on Chromium is not impractical for one person. It is impractical on this MacBook as configured, and fixing that costs about €7 a day or €199 a month. Two hard blockers stand in the way. Chromium's macOS SDK lookup only works inside a full Xcode install, so Command Line Tools fail. And the most Arc-complete solo fork, Stedding, refuses to sync with less than 150 GB free, against your 17 GB. Stedding also shows that one person can do it: a single developer working through Claude Code shipped 83 Chromium patches, Arc import, Spaces, split view and signed macOS releases in about eight weeks. That developer used a 64 GB M1 Max with 3.5-hour cold builds. Most of 2026's Claude-written Arc clones (Vela, Orbe, Yalqen, nyshk97/browser) chose Electron to avoid that build. They paid for it with fragile Chrome-extension support, no password manager, limited passkeys and unreliable Google sign-in.

Ranked by how close each engine can get to Arc:

1. A real Chromium fork, by a wide margin.
2. Electron with castLabs ECS and CEF Chrome style, roughly tied, each failing in a different place.
3. Swift with WKWebView (Nook).
4. Gecko (Zen).

The shortest path to the closest result:

- Fork Stedding (BSD-3).
- Build it on a rented Scaleway M4-M (10-core M4, 32 GB, 1 TB), with Claude Code working on that machine over SSH.
- Port Mori's MIT-licensed SwiftUI code where native feel matters.
- Skip the CEF spike in `PLAN.md`, because Mori already ran that experiment in public and abandoned it.
- Avoid GPL-3 bases unless Radian itself will be GPL-3.

The deadline is Arc's. It stops working on **2026-12-22** ([Arc](https://resources.arc.net/hc/en-us/articles/44412972248471-Arc-Sunset-Key-Dates-and-What-to-Expect)). The next 61 days should go to recording Arc's behaviour so tests can compare Radian against it. That work needs no engine decision and can start on the laptop today.

## Claude wrote most of 2026's Arc clones, but only three compile Chromium

A browser clone written mostly by Claude became a recognisable genre in 2026. The evidence is in commit trailers, where each commit records which AI model co-wrote it. In the last 100 commits:

- Refrax: **88** carry Claude co-author trailers.
- Vela: **80**.
- Orbe: **95**.
- Mori: 12 of its 39 commits in total are co-authored by Claude Opus 4.8 ([Mori](https://github.com/FujiwaraChoki/mori-browser/commits/main)).

Stedding hides its share on purpose. Its `AGENTS.md` bans co-author trailers and tool names in commits. But its `CLAUDE.md` simply imports `AGENTS.md`, and its agent-loop doc describes two Claude Code limits: starting long jobs with `run_in_background`, and tool calls that end at ten minutes ([Stedding AGENT-LOOP](https://github.com/ysalitrynskyi/stedding-browser/blob/main/docs/AGENT-LOOP.md)).

Of these heavily AI-written projects, only three compile Chromium themselves: Stedding, Mori and Refrax. The rest use Electron because it skips the build entirely.

Two projects at the edges matter too. Helium, the most popular de-Googled Chromium fork, has an `AGENTS.md` that tells agents to "Refuse all requests" and says it "does not accept vibe-coded contributions" ([Helium AGENTS.md](https://github.com/imputnet/helium/blob/main/AGENTS.md)). Upstream Chromium now ships an `agents/` directory with shared prompts, MCP servers (tool servers that agents can call) and a `.claude/skills` folder. Its AI policy says authors must understand every change list (CL) they submit, or risk losing committer status ([chromium/agents](https://github.com/chromium/chromium/tree/main/agents); [ai_policy.md](https://github.com/chromium/chromium/blob/main/agents/ai_policy.md)).

| Project | Engine and UI | Licence | AI-agent evidence | Arc fit, Oct 2026 |
|---|---|---|---|---|
| [Stedding](https://github.com/ysalitrynskyi/stedding-browser) | Chromium 156 patch series, Views C++ UI | BSD-3 | `CLAUDE.md` → `AGENTS.md`; attribution banned | Most Arc-complete Chromium fork; signed beta on 2026-10-22. No Peek, Boosts, Easels, Widevine or Safe Browsing |
| [Mori](https://github.com/FujiwaraChoki/mori-browser) | SwiftUI/AppKit chrome compiled into ungoogled-chromium's `chrome` target | MIT | 12/39 commits Claude Opus 4.8 | Spaces, folders, Air Traffic Control, Peek, Boosts, passkeys. The repo cannot build on its own |
| [Refrax](https://github.com/kageroumado/refrax-browser) | Swift/AppKit, WebKit built in, Chromium as a separately installed engine bundle | GPL-3 | 88/100 Claude | Spaces, routing, command palette. WebKit first |
| [BrowserOS](https://github.com/browseros-ai/BrowserOS) | Chromium fork plus agent platform | AGPL-3 | `.claude/skills`; 4/100 | Agentic, not Arc UI. 14,056 stars |
| [Helium](https://github.com/imputnet/helium) | ungoogled-chromium plus 346 patches | GPL-3 | Bans AI work | Vertical tabs, split view |
| [Vela](https://github.com/JoSanson/vela) | Electron, React 19, one `WebContentsView` per tab | GPL-3 | 80/100 Claude | Most Arc-complete Electron clone, 12 days old |
| [Orbe](https://github.com/amadoubaui/orbe) | Electron | MIT | 95/100 Claude | Arc import, Web Store installs, Easels-like boards |
| [Yalqen](https://github.com/YSamed/yalqen) | Electron 44 | MIT | 22 Claude commits | Keyboard-first command bar |
| [nyshk97/browser](https://github.com/nyshk97/browser) | Electron plus `electron-chrome-extensions` | GPL-3 | 17 Claude commits | Author's daily driver since Aug 2026 |
| [Flow](https://github.com/multiboxlabs/flow-browser) | Electron on castLabs ECS 41 | not checked | None found | Arc-like, 1,082 stars, no push since May 2026 |
| [Nook](https://github.com/nook-browser/Nook) | Swift + WKWebView | GPL-3 | Per-module `CLAUDE.md` docs | Closest native clone: Peek, split view, live folders, mini window |
| [Zen](https://github.com/zen-browser/desktop) | Firefox 158 fork | MPL-2.0 | Not measured | Spaces, essentials, glance, split view, boosts. 45,097 stars |

The working methods these builders published share a few habits.

**Stedding.** Its loop is "research → spec → failing test → implement → build → test → use it → patch → commit". Every fix is folded into the patch that owns the feature, so the patch series stays organised by feature rather than by date. Several build practices are written down ([AGENT-LOOP](https://github.com/ysalitrynskyi/stedding-browser/blob/main/docs/AGENT-LOOP.md)):

- Supervise long builds, don't poll them, using a 45-minute "dead-man's switch" budget.
- Collect every failure from a run in one pass. Fixing one failure per rebuild had cost "a dozen rebuild-and-run cycles".
- Use `git grep`, because `grep -r` timed out four times on the tree.
- Get fast rebuilds from a release build with DCHECKs on (debug assertions). It took 3 h 20 min from nothing but rebuilt in **3 minutes after an edit**, and found 12 defects.

**Mori.** All first-party code lives in one overlay directory inside Chromium. The rule for the bridge is: product and UI state go in Swift, and anything that touches Chromium objects goes in Objective-C++ ([Mori AGENTS.md](https://github.com/FujiwaraChoki/mori-browser/blob/main/AGENTS.md)).

**Refrax.** It touches upstream files in only seven patches and keeps everything else in its own `//refrax` directory ([Refrax patches](https://github.com/kageroumado/refrax-browser/blob/main/Engines/Chromium/patches/README.md)).

**Vela (Electron).** Its `CLAUDE.md` defines an autonomous protocol. A task counts as done only when the automated test is green, a Playwright screenshot has been inspected, and the box in `PROGRESS.md` is checked with the commit hash. Ambiguities go in `DECISIONS.md` ([Vela CLAUDE.md](https://github.com/JoSanson/vela/blob/main/CLAUDE.md)).

**ChatGPT Atlas.** OpenAI's browser takes the furthest version of the split. Chromium runs as a separate prebuilt host called OWL, so engineers "rarely build Chromium locally" ([OpenAI](https://openai.com/index/building-chatgpt-atlas)).

What nobody has published: token costs, a split of agent-written versus human-written code, or a forum write-up of the experience on Hacker News or Reddit. Those gaps are unmeasured, not zero.

## Xcode and 150 GB, not headcount, block Chromium on this Mac

**Xcode is the first blocker.** Chromium's `find_sdk.py` asks `xcode-select` for the developer directory and looks for `Platforms/MacOSX.platform/Developer/SDKs` inside it. If that path is missing, it stops with "Install Xcode, launch it, accept the license agreement" ([find_sdk.py](https://chromium.googlesource.com/chromium/src/+/main/build/mac/find_sdk.py)). Command Line Tools keep their SDKs in `/Library/Developer/CommandLineTools/SDKs`, which this Mac confirms, so the lookup fails.

Chromium's `main` branch pins SDK 27.0 for official builds, but accepts any SDK from 15 up for local builds ([mac_sdk.gni](https://chromium.googlesource.com/chromium/src/+/main/build/config/mac/mac_sdk.gni); [mac_sdk_overrides.gni](https://chromium.googlesource.com/chromium/src/+/main/build/config/mac/mac_sdk_overrides.gni)). Helium and ungoogled-chromium also need `xcodebuild -downloadComponent MetalToolchain`, which only exists inside Xcode ([Helium building.md](https://github.com/imputnet/helium-macos/blob/main/docs/building.md)). Apple's Xcode 26 beta 5 saved 2.85 GB by dropping Intel support, which it described as about 25% of the install ([Bitrise](https://bitrise.io/blog/post/xcode-app-size-reduction-in-26-0-beta-5)). That implies an install of roughly **8.5 GB** for Apple silicon only, which is half of your free space before any source arrives. That figure is derived, not published.

**Disk is the second blocker, and the bigger one.** Stedding's `sync-chromium` refuses to start below **150 GB free**. It measured a 65 GB checkout plus 9.3 GB for a release build ([Stedding ARCHITECTURE](https://github.com/ysalitrynskyi/stedding-browser/blob/main/docs/ARCHITECTURE.md)). Chromium's Linux and Windows docs ask for at least 100 GB ([Linux build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/build_instructions.md)). Even compressed with zstd at level 11, the whole build tree that CI uploads is 7–12.6 GB ([ungoogled run](https://github.com/ungoogled-software/ungoogled-chromium-macos/actions/runs/39156959588); [Helium run](https://github.com/imputnet/helium-macos/actions/runs/39651879454)). Seventeen gigabytes cannot hold Xcode and an unpacked tree.

**RAM is a soft limit.** Stedding calls 16 GB "the practical floor" and caps the build at `autoninja -j4` (four parallel jobs) ([Stedding ARCHITECTURE](https://github.com/ysalitrynskyi/stedding-browser/blob/main/docs/ARCHITECTURE.md)). Sessionat recommends 32 GB, because linking the Chromium framework alone takes about 28 GB ([Sessionat](https://github.com/dublyo/sessionat)).

Build times sit in a wide band:

| Machine | Build type | Time |
|---|---|---|
| M2 Pro, 16 GB, 2023 | Non-official | 1 h 23 min ([Medium](https://medium.com/@solomonkinard/chromium-build-on-m2-pro-d3210e859a43)) |
| M1 Max, 64 GB (Stedding) | Cold release | 3 h 29 min ([Stedding](https://github.com/ysalitrynskyi/stedding-browser/blob/main/docs/ARCHITECTURE.md)) |
| M1 Max, 64 GB (Stedding) | Official, with PGO and ThinLTO | 4 h 5 min |
| Depot 8-core M4, 24 GB runner | Official arm64, with PGO | about 6.5 h ([Depot](https://depot.dev/docs/github-actions/runner-types)) |

(PGO and ThinLTO are slower, optimised build modes that official releases use.) Nobody has published a first build on a 16 GB base M4.

Chromium's documented flags speed up the development loop ([Mac build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/mac_build_instructions.md)):

- `is_component_build=true` makes incremental builds much faster.
- `is_debug=false` makes linking faster.
- `symbol_level=0` speeds up both full builds and links.
- Apple's own linker, ld-prime, speeds up links on ARM Macs.

So the honest verdict is this. On this machine, as configured, Chromium is blocked rather than merely slow. For one person with the right build machine, it is clearly feasible, and Stedding finished its first two platforms in about eight weeks.

What stays expensive after the first build is maintenance, not compilation. Stedding calls itself a "minimal patch" fork, yet it already carries **10.9 MB across 83 patches**, and four of them are 0.7–1.4 MB each ([patches](https://github.com/ysalitrynskyi/stedding-browser/tree/main/patches)). Its sidebar subclasses upstream's vertical tab strip rather than forking `browser_view.cc`. That choice is deliberate: `browser_view.cc` changed in 412 commits in a year ([ADR 0010](https://github.com/ysalitrynskyi/stedding-browser/blob/main/docs/decisions/0010-ride-upstream-vertical-tabs.md)). Every Chromium stable release means rebasing that series.

Stedding keeps CI to cheap checks, because "GitHub-hosted runners cannot practically build Chromium". A weekly job confirms the patches still apply, and a daily job flags an outdated Chromium pin. Releases are built by hand ([Stedding CI reality](https://github.com/ysalitrynskyi/stedding-browser/blob/main/docs/ARCHITECTURE.md)).

## A €7 rented day beats every free way to cut the build

Every known way to cut the cost of a Chromium build fixes one thing and leaves another. Only renting a Mac fixes disk, RAM and Xcode together.

| Lever | What it cuts | What it leaves unsolved | Price and time |
|---|---|---|---|
| `fetch --no-history`, or Helium's prepared tarballs (1.98 GB base + 1.39 GB mac-arm64, no `gclient sync`) ([imputnet tarballs](https://github.com/imputnet/chromium-tarballs)) | Download size and sync time | The unpacked tree and `out/` still need tens of GB | Free |
| Development flags (component build, release, `symbol_level=0`, ld-prime), plus ccache | Build, link and rebuild time | Xcode, and the 150 GB floor | Free. Stedding's DCHECK build rebuilds in 3 min |
| External APFS SSD with Spotlight off, Xcode moved there via `xcode-select -s` | The internal-disk shortage | The 16 GB RAM floor. No measured speed penalty; Xcode on the SSD is untested | One SSD of at least about 256 GB (inferred from the 150 GB floor) |
| Free GitHub macOS runners, chained 6-hour jobs | Your CPU, disk and battery | About 43 h per build on 3-core M1 runners with 7 GB RAM; the 10 GB cache is too small for sccache to help | $0 on public repos ([run](https://github.com/ungoogled-software/ungoogled-chromium-macos/actions/runs/19588971585)) |
| Depot M4 runners (8 CPU, 24 GB, 400 GB) | Brings a build to about 7 h end to end | Per-minute billing | $0.08/min, about $34 per arm64 build ([Depot](https://depot.dev/docs/github-actions/runner-types)) |
| Scaleway M4-M (10-core M4, 32 GB, 1 TB) | Everything: disk, RAM, and Xcode stays remote | 24 h minimum lease | €0.29/h, about €7 a day, or €199 a month ([Scaleway](https://www.scaleway.com/en/pricing/apple-silicon/)) |
| AWS `mac-m4.metal` (24 GB, 2 TB) | Everything | 24 h minimum | $1.23/h, about $29.52 a day ([Vantage](https://instances.vantage.sh/aws/ec2/mac-m4.metal)) |
| Siso remote execution against EngFlow, NativeLink or BuildBuddy | Compile CPU | Links stay local on Mac; the full checkout stays local | BuildBuddy's free tier gives 80 Linux cores, but nobody has shown it working for Chromium ([BuildBuddy](https://www.buildbuddy.io/pricing)) |
| Prebuilt CEF 156 (312 MB) | The whole build | Inside your own NSViews it runs in Alloy style only, which blocks `chrome://extensions` | Free ([CEF builds](https://cef-builds.spotifycdn.com/index.json)) |
| OWL-style split: prebuilt Chromium host, Swift UI built locally | Local builds after the first | You still build the host and the bridge. Nothing public and permissively licensed exists | Atlas does this internally; Refrax does it under GPL-3 |

**Free CI.** Both ungoogled-chromium and Helium chain jobs to fit GitHub's limits. Each job runs `ninja` under `timeout` for about five hours, then compresses the whole `build/src` tree with zstd as an artifact for the next job to resume from. The chain can run up to 20 jobs ([github_build.sh](https://github.com/ungoogled-software/ungoogled-chromium-macos/blob/master/.github/scripts/github_build.sh)). This works on free runners, which offer 3 CPUs, 7 GB of RAM and a 6-hour job limit ([GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)). Both projects now run on Depot-sponsored M4s instead, because the free path took about 43 hours per build. That suits a release pipeline and is far too slow for iteration.

**Remote execution** does less than it promises on a Mac. Reclient "does not support Mac builds" for people outside Google. Siso can point at any compatible remote backend, and EngFlow supports macOS from Chromium 145 ([EngFlow](https://docs.engflow.com/re/chromium/migrating-from-reclient-to-siso.html)). But Chromium's own Siso config fails with "remote-link is not supported on Mac/iOS yet" ([clang_mac.star](https://chromium.googlesource.com/chromium/src/+/main/build/config/siso/clang_mac.star)). The heaviest step, linking, therefore still runs on the 16 GB laptop, and the full source tree still has to be on local disk.

**A rented Mac** removes every blocker at once. Apple's licence forces a 24-hour minimum lease, which makes Scaleway's €0.29/hour M4-M the cheapest serious option. It has twice the laptop's RAM, enough to cover Sessionat's 28 GB link figure, and a 1 TB disk that clears Stedding's 150 GB floor about six times over. Install Xcode there, not on the laptop. Run Claude Code on the rented Mac over SSH, so its builds start in the background and keep running between sessions.

The laptop then only runs the finished app. Chromium's Arm Mac guide says a non-component release `Chromium.app` can be copied between Macs, with `xattr -rc` to clear the quarantine flag ([Arm Macs](https://chromium.googlesource.com/chromium/src/+/main/docs/mac_arm64.md)).

## Chromium wins on Arc-likeness; Electron, CEF and WebKit each fall short somewhere different

Arc for Mac is a Swift app built on Chromium. Its shell sits on the Arc Development Kit (ADK), an internal SDK that The Browser Company said it could not open-source without exposing Dia's foundation ([heise](https://heise.de/-10414231)). `PLAN.md`'s own inspection of Arc 1.170.0 found the same split: a Swift shell over a 591 MB Chromium framework. Only a Chromium fork reproduces that architecture. Every other engine trades away something Arc users take for granted.

| | Chromium fork | CEF Chrome style | Electron + castLabs ECS | Swift + WKWebView (Nook) | Gecko (Zen) |
|---|---|---|---|---|---|
| Look and feel | Native Swift overlay (Mori) or Views (Stedding) | A CEF Views window. Only one Chrome-style web view per window, and no parent NSView | Web UI that can copy any layout, but not AppKit | Native SwiftUI/AppKit | Restyled Firefox chrome |
| Arc features in an existing base | Stedding has most; Mori adds Peek and Boosts | No shipped example | Vela and Orbe have most | Nook has most | Zen has most |
| Chrome extensions | Chrome's full extension system and Web Store | The real system via `chrome://extensions`, but no programmatic management; action popups unproven without a toolbar | A subset. MV3 extensions broke in Electron 40 and 43. No declarativeNetRequest, no `chrome.commands` | Chrome Web Store CRX installs, but no blocking `webRequest` | Firefox add-ons only |
| Netflix / Widevine | Needs a Google licence. Stedding ships without one | Not established | Works with free EVS signing, capped at 1080p like Chrome on Mac | FairPlay claimed but untested | No Widevine licence |
| Google sign-in | A full browser, outside the embedded-framework block. Untested | CEF is named in Google's 2019 block | Strip the "Electron" token from the user agent; still blocked in a 2026 report | WKWebView is named in Google's policy | Firefox-class |
| Passkeys | Mori ships native passkeys. iCloud Keychain needs Apple's browser entitlement (inferred) | Not established | Touch ID passkeys tied to one device; iCloud only for the app's own domains | Extension passkeys only; Apple declined the entitlement | Not checked |
| Password autofill | Chrome's password manager; Arc's profile is Chromium | Chrome's password manager is present | None built in, no macOS AutoFill | Extensions, or the app's own Keychain items | Firefox's manager plus extensions |
| Battery / memory | Chrome's tab discarding | Chrome's | No discard API; extension background pages always running | Tab unloading | 68% battery left vs Arc's 67% after 5 h |
| Builds on this Mac today | No | Yes, prebuilt | Yes | Yes, if Xcode fits | No (needs 30 GB) |

### CEF in a Swift window loses Chrome's extensions, which is why Mori left it

CEF's macOS header is explicit: "Alloy style will always be used if… |parent_view| is provided" ([cef_types_mac.h](https://github.com/chromiumembedded/cef/blob/master/include/internal/cef_types_mac.h)). Alloy style blocks `chrome://extensions` and supports only extension features that work below the UI ([cef#3859](https://github.com/chromiumembedded/cef/issues/3859)). Chrome style needs CEF's Views framework, and "a Chrome style Window can host at most one Chrome style BrowserView" ([cef_types_runtime.h](https://github.com/chromiumembedded/cef/blob/master/include/internal/cef_types_runtime.h)). That conflicts directly with Arc's split view and with a sidebar owned by SwiftUI. The macOS half of the request to embed Chrome style in your own windows is still open ([cef#3294](https://github.com/chromiumembedded/cef/issues/3294)).

Mori ran exactly the spike that `PLAN.md` proposes, in public. It built SwiftUI around CEF 148 with parent NSViews. Its own source comment conceded that "Chrome's built-in extension runtime is therefore not available on this surface". Two weeks after open-sourcing, it moved to compiling its UI into Chromium's `chrome` target ([MoriBrowserView.mm](https://github.com/FujiwaraChoki/mori-browser/blob/6f999a2403ae2bb514017e98838939aa8cafdbaf/Sources/Bridge/MoriBrowserView.mm); [BUILDING.md](https://github.com/FujiwaraChoki/mori-browser/blob/main/BUILDING.md)).

The best case for CEF is that Chrome style gives you Chrome's real extension system and password manager with no compile at all. Nobody has shipped an Arc layout on it. And Google's 2019 sign-in block names CEF by name ([Google Security Blog](https://security.googleblog.com/2019/04/better-protection-against-man-in-middle.html)).

### Electron gets the look right and leaves you to maintain the extension layer

Electron's docs call Chrome extension compatibility "a non-goal". They support only a DevTools-oriented subset, and load unpacked extensions only ([extensions.md](https://github.com/electron/electron/blob/main/docs/api/extensions.md)). Electron builds no declarativeNetRequest API, the blocking mechanism uBlock Origin Lite depends on ([_permission_features.json](https://github.com/electron/electron/blob/main/shell/common/extensions/api/_permission_features.json)).

Browser-grade extensions come from `electron-chrome-extensions`. It is licensed GPL-3 unless you buy a "Patron" licence, and its last npm release was July 2025 ([README](https://github.com/samuelmaddock/electron-browser-shell/blob/master/packages/electron-chrome-extensions/README.md)). Real extensions keep breaking:

- 1Password and Obsidian Web Clipper stopped loading in Electron 40 ([#172](https://github.com/samuelmaddock/electron-browser-shell/issues/172)).
- MV3 service-worker registration failed outright in Electron 43, and the fix was not backported ([electron#52265](https://github.com/electron/electron/issues/52265)).

Electron's real strength is DRM. castLabs ECS plus its free EVS signing service runs Netflix, and the castLabs maintainer re-tested it in March 2026 ([castlabs#224](https://github.com/castlabs/electron-releases/issues/224)). Netflix caps Chrome on Mac at 1080p, so that matches Arc-class quality ([Netflix](https://help.netflix.com/en/node/23742)). The catch is lag. The newest stable ECS line is 44.x on Chromium 152, while Electron 45 shipped on 2026-10-21 on Chromium 156 ([ECS wiki](https://github.com/castlabs/electron-releases/wiki); [v45.0.0](https://github.com/electron/electron/releases/tag/v45.0.0)). Radian's `package.json` already pins stock `electron ^45.0.0`, which has no Widevine at all.

Other gaps:

- **Passkeys.** Touch ID passkeys are tied to one device. iCloud Keychain passkeys work only for domains listed in the app's own Associated Domains entitlement ([app.md](https://github.com/electron/electron/blob/main/docs/api/app.md)).
- **Password autofill.** Form fields ignore macOS Password AutoFill ([electron#54142](https://github.com/electron/electron/issues/54142)).
- **Memory.** There is no API to discard a background tab ([electron#38278](https://github.com/electron/electron/issues/38278)).
- **Google sign-in.** A 2026 team using ECS removed the "Electron" token from the user agent and added Chrome's client hints, and Google still blocked sign-in ([castlabs#224](https://github.com/castlabs/electron-releases/issues/224)).

### WebKit can now run Chrome extensions, which undercuts `PLAN.md`'s stated reason for rejecting it

`PLAN.md` rejected WebKit because it "can't run Chrome extensions". That stopped being true on macOS 15.4, when Apple shipped `WKWebExtension` ([Apple](https://developer.apple.com/documentation/webkit/wkwebextension)). Nook installs `.crx` files straight from the Chrome Web Store through an "Add to Nook" button ([Nook ExtensionManager](https://github.com/nook-browser/Nook/blob/develop/Nook/Managers/ExtensionManager/CLAUDE.md)).

Nook still documents what a WebKit host cannot do ([Nook ExtensionManager](https://github.com/nook-browser/Nook/blob/develop/Nook/Managers/ExtensionManager/CLAUDE.md)):

- Classic uBlock Origin installs but cannot block requests.
- Sites that message extensions need a Nook-written polyfill.
- Bitwarden's biometric unlock needed a custom native-messaging host inside Nook.

Apple declined Nook's request for the browser passkey entitlement, so iCloud Keychain passkeys are out of reach and only extension passkeys work ([Nook CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/CLAUDE.md)). Netflix through FairPlay is claimed in a closed issue with no test posted ([Nook#263](https://github.com/nook-browser/Nook/issues/263)). Site quirks need patching, such as blurry Google Docs ([PR #366](https://github.com/nook-browser/Nook/pull/366)).

WebKit therefore loses Arc's engine behaviour even though it wins on native look.

### Zen has the features and the wrong ecosystem

Zen has modules for spaces, folders, live folders, glance, split view and boosts ([src/zen](https://github.com/zen-browser/desktop/tree/dev/src/zen)). But it has no Widevine licence ([discussion #14536](https://github.com/zen-browser/desktop/discussions/14536)), it offers only Firefox add-ons, and building it needs 30 GB free ([Zen docs](https://docs.zen-browser.app/contribute/desktop/building)).

### Battery does not decide between engines

On an M4 Pro in 2025, after five hours of scripted browsing ([Birchtree](https://birchtree.me/blog/seriously-use-the-browser-you-like-dont-worry-about-battery/)):

| Browser | Battery left |
|---|---|
| Zen | 68% |
| Arc | 67% |
| Safari | 61% |

Engine choice does not determine battery life. Implementation does: tab discarding, idle timers, and extension background pages.

That gives the final order. The Chromium fork comes first. Electron with ECS edges CEF Chrome style for second place, because Arc's identity is its window layout and Electron lets you place any number of web views anywhere. CEF has the better extension system but cannot host Arc's layout. Nook comes fourth and Zen fifth.

## The shortest path: record Arc now, rent a build Mac, fork Stedding

### Weeks 1–8: record Arc as a test oracle, on the laptop, at no cost

Arc stops working on 2026-12-22, and engine work can start later. Arc can only be measured before then. Over those 61 days:

- Record every interaction that `PLAN.md` lists: sidebar collapse, Little Arc, split view, Peek, the command bar and space swipes.
- Save scripted screenshots for later visual comparison with Radian.
- Export real `StorableSidebar.json` files to test the importer.
- Record Arc's energy use with the per-process `proc_pid_rusage` energy counter that Nook documents. That gives Radian a battery target taken from the real app ([Nook CLAUDE.md](https://github.com/nook-browser/Nook/blob/develop/CLAUDE.md)).

None of this depends on the engine.

### Build Radian: fork Stedding and build it on a rented Mac

Rent a Scaleway M4-M by the month (€199), install Xcode on it, and run Stedding's six scripts: `bootstrap-depot-tools`, `sync-chromium`, `apply-patches`, `apply-branding`, `build-chromium release` and `package-dmg` ([README](https://github.com/ysalitrynskyi/stedding-browser)). Day to day, use the release build with DCHECKs on, which rebuilds in 3 minutes. Keep Stedding's `AGENTS.md` rules: long builds run detached, failures are collected in one pass per run, and every number written in the docs comes from the tooling rather than being typed by hand.

Keep Stedding as an upstream remote and carry Radian's patches on top of its series. While Stedding stays active (its last release shipped on 2026-10-22), it does the monthly Chromium rebases for you. If it stops, BSD-3 lets you take the series over.

For release builds, use the rented Mac or Depot at about $34 per build. Stedding's weekly check that the patches still apply runs free on GitHub.

### Close the Arc gaps Stedding lacks

Stedding is missing Peek, Boosts, Easels, the mini player, Live Folders, sync and Widevine. Mori already has Peek and Boosts under MIT, so its code can move into a BSD-3 fork with a copyright notice. Nook's live folders and Zen's boosts can be used as ideas only. Follow Stedding's own rule here: copyleft features are "rebuilt from scratch, from written descriptions; nothing of theirs is copied" ([ADR 0021](https://github.com/ysalitrynskyi/stedding-browser/blob/main/docs/decisions/0021-ideas-from-nook-and-aura.md)). Sync matters more than it looks, because Arc's own sync ends at the sunset.

If testing against the Arc recordings shows that Views cannot match Arc's motion, the fallback is Mori's architecture: a SwiftUI overlay compiled into Chromium's `chrome` target. Mori's repo lacks two pieces: the `mori_ui_swift` GN target in `chrome/browser/ui/BUILD.gn`, and the Chromium hook that creates its window instead of `BrowserView`. Both would have to be rebuilt ([SOURCE_LAYOUT.md](https://github.com/FujiwaraChoki/mori-browser/blob/main/docs/SOURCE_LAYOUT.md)). An overlay directory with a few hooks, the pattern Mori, Refrax and Atlas use, also cuts rebase work compared with Stedding's large patch series.

### Netflix is a licensing problem, not an engineering one

A self-built Chromium gets no Widevine. Stedding states "no Widevine and no Safe Browsing" ([README](https://github.com/ysalitrynskyi/stedding-browser)). Getting it means a Widevine agreement with Google through a registered company. A secondary source says the licence itself is free ([Nook#263](https://github.com/nook-browser/Nook/issues/263)). Until Radian has one, it matches Stedding and not Arc on streaming. That is the one dimension where Electron with ECS beats the recommended path out of the box.

### What each path costs

| Path | Hardware or spend | First full build | Edit-to-run loop | Licence inherited |
|---|---|---|---|---|
| **Stedding fork on a rented Scaleway M4-M (recommended)** | €199/month, or about €7 per 24-hour day. Laptop unchanged | Hours (3 h 29 min cold on Stedding's 64 GB M1 Max) | 3 min (release build with DCHECKs) | BSD-3 |
| Stedding fork on the laptop plus an external SSD | APFS SSD with at least 150 GB free, full Xcode, `-j4`, heavy swapping at link time | Not measured on a 16 GB M4 | Not measured | BSD-3 |
| CI release builds only | Free GitHub runners (about 43 h) or Depot (about $34 per build) | — | — | — |
| Rebuilding Mori | As for Stedding, plus recreating the GN target and window hook | Not documented | `ninja chrome`, then repackage | MIT |
| Nook fork | Xcode 26 or later (about 8.5 GB, derived) squeezed into 17 GB. $0 | No Chromium compile | Xcode | GPL-3 |
| Electron clone (Orbe or Yalqen MIT, Vela GPL-3) | $0. Free EVS signup for Widevine | No engine compile | Electron reload | MIT or GPL-3, plus GPL-3 or a paid Patron licence for `electron-chrome-extensions` |
| Zen fork | At least 30 GB free, so an SSD or disk cleanup | Full Firefox build | `npm run build:ui` for UI-only changes | MPL-2.0 |

### What the licences mean

**MIT** (Mori, Orbe, Yalqen) and **BSD-3** (Stedding) both allow a closed or open Radian, as long as you keep the copyright notices. MIT code can go into a BSD-3 fork.

**GPL-3** (Nook, Vela, Refrax, Helium, nyshk97/browser and `electron-chrome-extensions`) makes Radian GPL-3 as soon as any of that code is included. Nook's README puts all its own code under GPL 3.0 ([Nook](https://github.com/nook-browser/Nook)).

**AGPL-3** (BrowserOS) adds a network clause on top of GPL-3.

**MPL-2.0** (Zen) is copyleft per file: it covers the MPL files and any changes to them, but not new files you add alongside.

The bases not to fork, and why:

- **Mori:** cannot be reproduced from its repo.
- **Nook:** GPL-3, and WebKit's engine gaps.
- **Vela and other Electron clones:** extension fragility, plus GPL-3.
- **Helium:** GPL-3, and it bans AI-written contributions.
- **CEF:** forced into Alloy style inside your own NSViews.

## Conclusion

Chromium's difficulty has changed character. Agents now write most of these browsers' code, so writing the code is no longer the bottleneck. A solo developer with Claude Code can carry an 83-patch Chromium fork across two platforms in two months. What still decides the outcome is infrastructure and licensing: a machine with Xcode, about 150 GB and 32 GB of RAM, which rents for €7 a day; and a Widevine agreement only a company can sign. That is why most hobby Arc clones are Electron apps. Their authors avoided the build machine, not the C++, and so took on an extension layer that breaks with each Electron major version. The cheapest way past both problems is to rent the machine and inherit Stedding's patch series, not to work around either.

Two less obvious points follow. First, `PLAN.md`'s CEF-versus-Chromium spike has already been run in public. Mori's CEF code comment and its migration two weeks later are the result, so Radian can skip it. Second, `PLAN.md` gave the wrong reason for rejecting WebKit. WebKit can now run Chrome Web Store extensions; it loses on extension fidelity, passkeys and engine behaviour instead. For "identical to Arc" the conclusion stands, but Nook becomes a serious fallback if Chromium proves too costly to maintain.

Some things are still unknown:

- Real build times on a 16 GB M4.
- Whether Stedding builds cleanly on a different machine.
- Whether Apple would grant a Chromium fork the browser passkey entitlement.

The first day of a rented M4-M settles the first two, for about €7. The Arc recordings cannot wait: they have to be captured before 2026-12-22.
