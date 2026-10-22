# Arc 1.170.0: bundle structure (metadata only)

Measured 2026-10-23 on `/Applications/Arc.app` (build 89123). Metadata only: Info.plist, Mach-O load commands, code signature, file sizes and file names. No code was disassembled and no asset was extracted.

REA Evidence IDs:

- Info.plist: `ev_4c9ef068ab8529aa19769fa825113acb89b7ae54f8536fe1bc3b4825d70c0d56`
- Mach-O inspection (parent): `ev_048744d99719f15c539e2be94f304b1a2ea4fc760f40e09f5f18d1d08c531a83`
  - summary view `ev_b96faf480797e80806b99d015cfa78584e084a87ffa6fb760cd299c7d52d1ad4`
  - dependencies view `ev_f014b2ba2bbc18341c8340614dbe3daaa0d3b758816a55afb66d55f00f8d4e91`
  - build metadata view `ev_da4a67e7cd6018e925a1768faeb9cf996d7376be8562ceaeaa723d8d55d47e8b`
- Code signature and entitlements: `ev_3aa26f22fd9fb9bee9ed6018919e2d2ffc6ed745c85833531e348575bb22a243`

Sizes and file names came from `du`, `ls` and `file`. They are marked (fs).

## Info.plist highlights (REA ev_4c9ef068…)

| Key | Value | What Radian does with it |
|---|---|---|
| CFBundleIdentifier | `company.thebrowser.Browser` | Radian keeps its own id |
| CFBundleShortVersionString / CFBundleVersion | 1.170.0 / 89123 | |
| BCNYCommitInfo / BCNYBuildDate | Release-89123-9f5625b3…, 21 Oct 2026 20:45 | |
| LSMinimumSystemVersion | 13.0.0 (Mach-O build metadata agrees: minos 13.0, SDK 26.4, ld 1266.8) | Electron's floor is similar |
| NSPrincipalClass / NSMainNibFile | `Arc.BrowserApp` / `MainMenu` | AppKit app with a nib main menu |
| CFBundleURLTypes | `http`, `https`, `mailto`, `arcBrowser` (the last has role Editor) | register http/https/mailto; a custom scheme is optional |
| CFBundleDocumentTypes | PDF (`com.adobe.pdf`), HTML (`public.html`), XHTML (`public.xhtml`), all role Viewer | same three in electron-builder `fileAssociations` |
| NSUserActivityTypes | `NSUserActivityTypeBrowsingWeb` (Handoff) | optional |
| OSAScriptingDefinition / NSAppleScriptEnabled | `Arc.sdef` / true | see menus.md (P2) |
| NSDockTilePlugIn | `DockTilePlugIn.plugin` (2.7 MB (fs)): changes the Dock icon while the app is not running | optional |
| ATSApplicationFontsPath | `Fonts`. No top-level Fonts folder exists. The 83 bundled fonts live in `ARCClients_FontsManager.bundle` (fs) | |
| NSAppTransportSecurity | NSAllowsArbitraryLoads = true | |
| LSEnvironment | `MallocNanoZone=0` (Chromium's usual setting) | |
| LSApplicationCategoryType | public.app-category.productivity | |
| Sparkle | SUFeedURL `https://releases.arc.net/updates.xml`, automatic checks and automatic update on, interval 28800 s (8 h), EdDSA public key set | Radian uses electron-updater |
| Usage strings | camera, microphone, Bluetooth, location (4 variants), Downloads folder, Desktop folder | copy the set of keys with our own wording |
| GPUEjectPolicy | wait | |
| NSSupportsSuddenTermination / AutomaticTermination | false / false | |
| Build toolchain | Xcode 2641 (17E202), SDK macosx26.4, build machine 25F71 | |

## Linked libraries (Mach-O load commands of `Contents/MacOS/Arc`, arm64 slice; REA ev_f014b2ba…)

There are 86 dependencies and 107 load commands in total. The binary is universal (x86_64 + arm64), UUID `BE2EB88A-675C-357B-8143-840A9196E154`.

- **Bundled (@rpath / @executable_path):**
  - `ArcCore.framework` 8078.0.48. This is Chromium. 8078 may be the Chromium build number, but that is unverified.
  - `Lottie.framework` 1.0.0
  - `Sparkle.framework` 2.9.4
  - `libswiftCompatibilitySpan.dylib` (weak)
- **Apple UI:** AppKit, SwiftUI 7.4.27, QuartzCore, CoreGraphics, CoreText, CoreImage, Metal, MetalKit, GameplayKit, QuickLookUI, QuickLookThumbnailing, PDFKit, WebKit (linked; Arc's pages still render in ArcCore).
- **Media:** AVFoundation, AVFAudio, AVKit, CoreMedia, CoreVideo, ScreenCaptureKit.
- **System:** Foundation, CoreFoundation, CoreServices, Carbon (global hotkeys), IOKit, Security, SystemConfiguration, CFNetwork, CryptoKit, CoreLocation, CoreData, CloudKit (sync), UserNotifications, NaturalLanguage, Accelerate, Combine, ScriptingBridge, MetricKit (weak).
- **C libraries:** libc++, libz, libxml2, libcompression, libobjc, libSystem.
- **Swift overlays:** Core, Concurrency, StringProcessing, RegexBuilder, AppKit, CoreGraphics, Network, os, OSLog, simd, Spatial, Synchronization, XPC, UniformTypeIdentifiers, and others (weak where optional).

Two notes:

- SwiftUI and AppKit together mean the sidebar is native SwiftUI views over AppKit. The accessibility tree agrees: the toolbar buttons are `AXHostingView` and the tab list is an `AXOutline` (NSOutlineView). See layout/spec.md.
- GameplayKit is linked. It is plausibly used for the noise behind the theme grain, but that is an inference only.

## Frameworks folder (fs)

| Framework | Size |
|---|---|
| ArcCore.framework | 591 MB |
| Lottie.framework | 4.3 MB |
| Sparkle.framework | 2.8 MB |
| FirebaseFirestoreInternal, absl, grpc, grpcpp, openssl_grpc | about 100 KB each (stub-sized) |
| Sentry.framework | 96 KB |

## Bundle layout and sizes (fs)

| Path | Size / count |
|---|---|
| Arc.app total | 869 MB |
| Contents/MacOS (Arc executable) | 158 MB |
| Contents/Frameworks | 599 MB |
| Contents/Resources | 109 MB: 144 entries, 83 SwiftPM `*.bundle` resource bundles (one per feature module, names in menus.md), 55 `.lproj` localizations, `Assets.car` (3.2 MB), `AppIcon.icns`, `Arc.sdef`, `popularDomains.json`, `GoogleService-Info.plist` |
| Contents/PlugIns | `DockTilePlugIn.plugin` |
| `.car` asset catalogs, whole bundle | 45 (not opened) |
| Audio files | 3 |
| Fonts | 83 files, all in `ARCClients_FontsManager.bundle` except 2 icon fonts in `ARCClients_Icons.bundle` |

The bundled font families are Nunito, Pitch / Pitch Sans, Marlin Soft, Söhne Breit, ABC Favorit (plus Mono and Lining), Space Mono, Inter, Inconsolata, National 2, GT Ultra, EB Garamond and ABC Oracle. These are for Notes, Easels and Boosts. The browser UI itself uses the system font (SF Pro); layout/spec.md fits text widths against SF.

`inspect_asset_catalog` was not run: REA resolved the `.app` target to its Mach-O executable and refused it ("requires an active .app bundle target").

## Signature and entitlements (REA ev_3aa26f22…)

- Signed `Developer ID Application: The Browser Company of New York Inc. (S6N382Y83G)`, with hardened runtime and a secure timestamp of 22 Oct 2026.
- Entitlements:
  - `com.apple.application-identifier`, `com.apple.developer.team-identifier`
  - `aps-environment` production (push)
  - `associated-domains` `webcredentials:arc.net`
  - iCloud CloudKit, container `iCloud.net.arc.sidebar` (sidebar sync), environment Production
  - `com.apple.developer.web-browser.public-key-credential` (passkeys as a browser)
  - `device.audio-input`, `device.camera`, `personal-information.location`
  - keychain groups `…browser.webauthn` and `…browser.auth`
- There is no App Sandbox entitlement: Arc ships outside the Mac App Store and is not sandboxed.
- For Radian, the passkey entitlement (`web-browser.public-key-credential`) needs Apple approval and a provisioning profile. Electron can't use it without them.
