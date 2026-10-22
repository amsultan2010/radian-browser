# Radian — plan

Goal: a macOS browser an Arc user can switch to and not notice the difference, apart from the name and logo.

## What ArtCraft actually did

ArtCraft (Brandon Thomas's Rust rebuilds of Photoshop and other Adobe apps) did **not** decompile Adobe's code, and its contributor rules ban disassembling Adobe's app bundles. The method:

1. **Inventory the original without copying it**: menus, shortcuts, plug-ins, public file-format specs.
2. **Use the original as a test oracle**: scripts drove real Photoshop to make 250+ reference files; tests require pixel-matching output.
3. **Track parity as numbers**: 627/627 menu items live, 307/309 PSD round-trips passing.
4. **Let agents write the code** against those tests (1,300+ commits, most co-authored by Claude).

REA is a separate tool. Use it here to observe Arc's behaviour and read our own data files, not to lift Arc's code.

## What Arc is made of (from Arc 1.170.0 on this Mac)

- `MacOS/Arc` (158 MB): the native Swift UI shell. This shell is the product.
- `ArcCore.framework` (591 MB): Chromium, the engine (the "Arc Development Kit").
- Firebase (sync), Sparkle (updates), Lottie (animations), Sentry (crash reports).
- User data: `~/Library/Application Support/Arc/Storable*.json` (spaces, pinned tabs, folders, archive, key bindings) plus `User Data/`, a standard Chromium profile (history, cookies, passwords, extensions).

## Process

1. **Parity ledger** (`parity/`): every Arc menu item, shortcut, setting and feature, taken from the running app's menus and Arc's public help docs. Each row: done / partial / missing.
2. **Behaviour captures**: record each interaction in Arc (sidebar collapse, Little Arc, split view, peek, command bar, space swipe) with REA's UI capture tools; write a short spec per feature with sizes, timings and colours measured from the captures.
3. **Arc importer first**: read `StorableSidebar.json` and the Chromium profile so a user's spaces, pinned tabs, folders, history and logins arrive on first launch. This is what makes the switch unnoticeable.
4. **Oracle tests**: the same scripted scenario run in Arc and Radian, screenshots diffed; the importer tested on real Arc exports.
5. **Build feature by feature** against the ledger, with agents working in parallel on separate features.

## Rules (the ArtCraft rules, for the same reasons)

- No decompiling or disassembling Arc, and no copied Arc code, icons, sounds, Lottie files or other assets.
- Recreate behaviour and feel from observation and public docs; draw our own art.
- Don't use the name "Arc" in branding beyond "import from Arc".

## Open decision: the engine

- **Chromium**: what Arc uses. Chrome extensions and identical site behaviour, but the hardest path (embedding Chromium in a Swift app is what took Arc's team years).
- **WebKit (`WKWebView`)**: Safari's engine, built into macOS. Far faster to build and lighter, but no Chrome extensions, so 1Password/uBlock-style setups change for switchers. Open-source Arc-likes Nook and Ora take this path.
