# Arc 1.170.0: app icon picker

Collected 2026-10-23 for ledger row 53 (App icons). Sources: Arc's help center (through search-engine excerpts, the pages answer 403 to scripts), Reddit, Arc.app's `Info.plist`, a targeted `strings` grep of `Arc.app/Contents/MacOS/Arc`, and `defaults read company.thebrowser.Browser`. No Arc artwork was opened or copied.

## Where it lives

- **Arc > Settings > Icon**: its own Settings pane, not part of Appearance ("Head to Arc > Settings > Icon", [HC-ICON]). The binary names it `AppIconPreferencePane`, with one `AppIconOptionView` per icon.
- Locked icons are shown greyed out (`AppIconPreviewDisabled`), each with "Refer %d friend to unlock" / "Refer %d friends to unlock". The pane's pitch is "Unlock app icons by sharing Arc with friends!" and "Share Arc to unlock exclusive app icons!".
- After an unlock, the sidebar shows a "New Arc Icon Unlocked" banner (`SidebarBannerNewArcIconUnlockedView`). The Share Arc sheet says: "Thanks for sharing Arc! As a token of our appreciation, you'll unlock custom app icons as your friends join Arc."
- **Unlock rules** ([HC-SHARE]): icons appear as friends join through your referral link. Only new Mac members count, and only from 29 February 2024. **Hologram** is only for members who joined before Arc for Mac's General Access on 24 July 2023. The FAQ has a page for referrals that don't unlock icons ([HC-FAQ]).
- **Labels:** the binary and every English `.strings` file have no display names for the icons (no "Fluted Glass", "Schoolbook" or "Hologram" in capitals). The tiles are probably unlabelled. Not verified: the pane was not opened.
- **Layout:** one row or grid of icon tiles. Not verified for the same reason. There are no public screenshots with a readable layout.

## The icons

The internal IDs, in the binary's `AllCases` order, are `original`, `candy`, `hologram`, `neon`, `flutedGlass`, `schoolbook`, `colorful` and `betterDaysSunIcon`. Each has an asset pair, `AppIcon<Name>` (the icon) and `AppIcon<Name>Preview` (the pane's thumbnail). `betterDaysSunIcon` only appears next to `subscriptionPreferredBetterDaysAppIcon`, so it looks tied to a subscription, not to referrals. `AppIconEarlyBirds`, `AppIconCanary` and `AppIconDev` belong to build channels, not to the picker.

On this Mac, `defaults read company.thebrowser.Browser` gives `availableAppIconNames = (original, candy, neon, flutedGlass, schoolbook, colorful)` and `currentAppIconName = "arc.original"`. Hologram is missing because of the date rule above.

There is no "Candy Arcade" or "Moonlight" icon in 1.170. Candy is `candy`, and `MoonLight` is an unrelated string.

| Arc ID | What the name suggests (inferred, the artwork was not looked at) | Radian's echo |
|---|---|---|
| `original` | The default icon | `original` |
| `candy` | Glossy sweets colours | `candy` |
| `hologram` | Iridescent foil, colour shifting with the angle | `hologram` |
| `neon` | Glowing tubes on a dark tile | `neon`, and `arcade` (pixel art on a night tile) |
| `flutedGlass` | The mark seen through ribbed (reeded) glass | `fluted`, and `glass` (frosted) |
| `schoolbook` | Exercise-book paper and school ink | `schoolbook`, and `ink` |
| `colorful` | A multicolour version | `sunset` |
| `betterDaysSunIcon` | A sun | `sunset` |

Radian-only variants: `midnight`, `sorbet`, `metal` (polished chrome on graphite) and `graphite` (monochrome).

## How Arc applies the icon

`Info.plist` has `NSDockTilePlugIn = DockTilePlugIn.plugin`, and the binary has `apply(nsImageAppIcon:dockTile:appIconID:)`, `applyWithWorkspace(nsImageAppIcon:)` and `notifyDockTilePlugIn(dockTile:appIconID:)`. So Arc sets the Dock tile while it runs, sets the bundle's icon through NSWorkspace (Finder), and keeps a Dock tile plug-in that draws the chosen icon while Arc is closed. Radian only does the first: see the `shortcut:` comment in `src/main/app-icon.js`. That comment says Arc has the same limit, which is not the case.

Reddit says Arc does not take custom icon files: [RD-CUSTOM] blames Apple's NSDockTile API. [RD-TAHOE] notes Arc's alternate icons in Settings, in a thread about the icon on macOS Tahoe.

## Sources

- [HC-ICON] Change Arc for Desktop App Icon: https://resources.arc.net/hc/en-us/articles/22352326167703-Change-Arc-for-Desktop-App-Icon
- [HC-SHARE] Share Arc and unlock app icons (Arc for macOS): https://resources.arc.net/hc/en-us/articles/21886232998807
- [HC-FAQ] FAQ, "Why Are My Share Arc Referrals Not Unlocking New Desktop App Icons?": https://resources.arc.net/hc/en-us/sections/16435226334743-FAQ
- [HC-SEARCH] How Do I Change the Arc Search App Icon (iOS and Android: Tab Switcher > Settings > Change App Icon): https://resources.arc.net/hc/en-us/articles/27777014088215-How-Do-I-Change-the-Arc-Search-App-Icon
- [RD-CUSTOM] r/ArcBrowser, "Custom logos": https://www.reddit.com/r/ArcBrowser/comments/1gae42v/custom_logos/
- [RD-TAHOE] r/ArcBrowser, "Arc icon on macOS Tahoe": https://www.reddit.com/r/ArcBrowser/comments/1l87ff4/arc_icon_on_macos_tahoe/
- Local: `/Applications/Arc.app/Contents/Info.plist`, `PlugIns/DockTilePlugIn.plugin/Contents/Info.plist`, `strings MacOS/Arc | grep -i -E 'appicon|unlock|flutedGlass|schoolbook|hologram'`.
