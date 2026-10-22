# Arc for macOS: web research for Radian

Researched 2026-10-23, the day after the sunset was announced. This file only adds what `features.md`, `visual-spec.md` and `menus.md` do not already cover. Everything is paraphrased. Source keys link to the list at the bottom.

## Tags

- **documented**: stated or shipped by The Browser Company (TBC): arc.net HTML and CSS, the help center, release notes, TBC posts, official images and videos.
- **observed**: seen rather than stated. This covers third-party reviews and forums, and also my own measurements of official images and videos (marked "measured").
- **observed-local**: file names and media properties read from the installed Arc 1.170.0 bundle. Nothing was copied into the repo.
- **inferred**: my conclusion from the above.

## What changed on arc.net

- arc.net is now a single "A farewell to Arc" page. `/max` and `/blog` redirect to it, `/features` returns 404, and `/download` still works ([ARC], [ARCDL]).
- The older marketing pages (2023–2025) survive in the Wayback Machine, including their product images and videos ([WB25], [WB23], [WBMAX]).
- The farewell page includes TBC's own hand-built HTML/CSS replica of an Arc window. It is the most precise public source for Arc's sidebar proportions (section 2.1).

---

## 1. Brand system

### 1.1 The Arc mark (logo)

| Detail | Tag | Source |
|---|---|---|
| **Construction.** An "A" built from thick strokes with fully rounded caps. Two parts: <br>- an inverted V with a rounded apex (the A's legs) <br>- a curved swoosh, shaped like a smile, that crosses the legs as the A's crossbar | documented | [LOGO-C] [ARCDL] |
| **Swoosh path.** It starts as a round cap at the upper left, at about 40% of the mark's height. It dips below the apex, passes over the left leg and under the right leg, then rises to a round cap at the upper right, at about 25% height. The right end is higher than the left. | observed (measured) | [ARCDL] |
| **Proportions** (40 × 35 sticker version): <br>- stroke width about 7.06 units, roughly 20% of the mark's width (from the cap arc radius of 3.53) <br>- width-to-height about 1.2 : 1 (the farewell colour SVG is 262.3 × 219.9) | observed (measured) | [ARCDL] [LOGO-C] |
| **Weave.** The strokes weave over and under each other. Small darker segments where they cross read as shadow: <br>- the left leg below the swoosh is deep indigo <br>- the swoosh darkens where it passes under the right leg | documented | [ARCDL] [LOGO-C] |
| **Colours** (flat fills, no gradient anywhere): <br>- legs: coral red `#FF5060` (download page) or `#F25E6B` (farewell SVG) <br>- swoosh, left half: blue `#0034FE` / `#0030EC` <br>- swoosh, right arm: pink `#FF9999` <br>- crossing shadows: `#210784`, `#26069C`, `#2404AA` | documented | [ARCDL] [LOGO-C] |
| **Sticker version.** An off-white (`#FFFCEA`) border about 3.1 units thick wraps the whole mark, like a die-cut sticker. Each layer also carries a faint background-blur filter (stdDeviation 0.495). | documented | [ARCDL] |
| **Outline version.** A line-art mark: white fill with a black outline (stroke 30.16 on a 292-unit-wide drawing, about 10% of the width). A 49 × 49 single-colour outline version is also used. | documented | [LOGO-O] [ARCDL] |
| **Farewell hero.** The page stacks the outline and colour SVGs, and the logo can be grabbed and dragged (it has a grab cursor). | documented | [ARC] |
| **macOS app icon.** The sticker mark sits on a white or very light grey squircle with a soft drop shadow. Where strokes overlap, the colours deepen, as if they were slightly translucent. Sampled colours: <br>- coral `#F07078`, darker overlap `#E05870` <br>- blue `#1848F0`, deeper overlap `#0830E8` <br>- pink `#FF9898` <br>- indigo `#2808A8` | observed (measured) | [ICON] |

Do not ship any of these. Radian needs its own mark; this table is here so we know what to avoid copying.

### 1.2 Wordmark and fonts

| Detail | Tag | Source |
|---|---|---|
| arc.net has no "Arc" wordmark in use. The footer shows TBC's wordmark: "THE BROWSER COMPANY" in serif capitals, with "of NEW YORK" below and a script italic "of". | documented | [ARCDL] |
| Fonts on arc.net, as named in its CSS tokens: <br>- `Marlin`: the brand sans <br>- `Marlin Soft SQ`: soft, rounded headings <br>- `Marlin Soft Basic`: preloaded as OTF files <br>- `InterVariable` / `Inter`: body and CTAs <br>- `ABC Oracle` (weights 300/350): the farewell page's body <br>- `ABC Favorit Mono`: mono <br>- `Exposure VAR`: serif feature headings <br>- `Space Mono`: annotations | documented | [ARC] [ARCDL] |
| Marlin Soft is FontMesa's rounded variant of Marlin Sans. It ships round-dot and square-dot versions, so "SQ" probably means the square-dot cut. | inferred | [FM] |
| The Arc app's own UI uses the macOS system font. TBC's HTML replica of the Arc window sets it as `-apple-system, "SF Pro Text"`. | documented | [RN22] [ARC] |
| Help-center illustrations pair a monospace handwritten-style caption with a hand-drawn red arrow. | observed | [PT-IMG] |

### 1.3 Brand colours (arc.net design tokens)

| Token | Value | Tag | Source |
|---|---|---|---|
| brandBlue (also the `theme-color` meta) | `#3139FB` | documented | [ARC] [WB25] |
| brandDarkBlue | `#000354` | documented | [ARC] |
| brandDeepBlue | `#2404AA` | documented | [ARC] |
| brandOffwhite | `#FFFCEC` | documented | [ARC] |
| brandRed | `#FB3A4D` | documented | [ARC] |
| focusOutline | `#96C4FF` | documented | [ARC] |
| Footer blue on the download page | `#2702C2` | documented | [ARCDL] |
| Primary ramp 1–12 (coral) | `#FFEAE7 #FFC9C3 #FCA39F #FC8279 #FD6958 #FA4531 #CF3828 #A22B1F #741E15 #47110C #1A0402 #090201` | documented | [ARC] |
| Download-button glow | A conic gradient `#8CACFF → #F0B4FF → #FFFFFF → #FF89B3`, blurred 10px at opacity 0.575. On hover: opacity 0.8, scale 1.015, over 0.15s ease-out. | documented | [WB25] |
| Grain on off-white sections | A `noise-light.png` tile over brandOffwhite | documented | [WB25] |
| Farewell page | Page `#0B0B0B`, accent `#4E36FF`. Motion tokens: `--ease: cubic-bezier(0.16,1,0.3,1)`, `--move: 0.22s`. These are the website's motion, not the app's. | documented (web) | [ARC] |

Other site tokens: radii 2/4/8/12/16/32/9999px, and three shadows (small `0 5px 10px`, medium `0 8px 30px`, large `0 30px 60px`, all `rgba(0,0,0,.12)`) ([ARC]).

### 1.4 Official product images and videos (still reachable)

| Asset | What it shows | Source |
|---|---|---|
| `theme-picker.png`, `theme-picker.mp4` (3 s) | The Theme Picker over a split Easel and page. A dot is dragged around the colour field and the whole window recolours live. | [IMG-THEME] [VID-THEME] |
| `space-swiping.png`, `space-swiping.mp4` (3 s) | A trackpad swipe from an amber-to-coral Space to a lavender Space, and back. | [IMG-SWIPE] [VID-SWIPE] |
| `zero-chrome.png`, `zero-chrome.mp4` (3 s) | A light neutral Space; the sidebar hides, then comes back. | [IMG-ZERO] [VID-ZERO] |
| Arc Max videos | Tidy Tabs, Tidy Downloads, 5-Second Previews, Ask ChatGPT, Ask on Page | [WBMAX] |
| Help-center GIF of Little Arc opening from Slack | 800 × 450, 112 frames at 70 ms each | [LA-GIF] |
| Arc.app onboarding clips: `new_tab`, `pinning`, `space_swiping`, `split_view` | Each is 8.5 s at 1920 × 1200 and 60 fps. These real UI captures are the best timing source. | [LOCAL] |

---

## 2. Concrete visual details

### 2.1 TBC's own HTML replica of an Arc window (farewell page)

TBC drew this window at 1337 × 887 CSS px in a coral Space. I rendered it locally to check it. The values line up closely with the in-app measurements in `menus.md` and in Orbe's `docs/analyse-arc.md`, so treat it as the best reference we have. All rows are documented in [ARC] and [ARC-CSS]; the cross-check column cites [MENUS] and [ORBE].

| Element | Value in the replica | Cross-check |
|---|---|---|
| Window frame | Background `#FF8A91`; corner radius 10px; padding 9.7px on the top, right and bottom, none on the left; shadow `0 20.34px 49.66px rgba(0,0,0,.22)` plus an inset 0.5px ring `rgba(120,0,20,.12)` | Content inset about 10pt ([MENUS], [ORBE]) |
| Grain | Overlay: SVG `feTurbulence` fractalNoise, baseFrequency 0.9, 2 octaves, 160px tile, noise alpha 0.55, layer opacity 0.06 | None |
| Traffic lights | 12px circles, 7.7px apart; `#FF5F57`, `#FEBC2E`, `#28C840` | 16×16 frames, 23pt pitch ([MENUS]) |
| Toolbar row | 36px tall. A sidebar-toggle icon (19 × 14) on the left; back, forward and reload on the right, 17.5px apart. | Buttons at y=8 ([MENUS]) |
| URL field | 35px tall, radius 9px; fill is a "well" colour slightly darker than the frame (`#F47B82` on `#FF8A91`); text 13.5px. Right side: a link (copy URL) icon and a sliders (Site Control Center) icon. | 36pt tall, radius about 10 ([MENUS]); 35pt, radius 11 ([ORBE]) |
| Favorites | 3-column grid, 8.4px gap, 18.6px below the URL field; tiles 45px tall, radius 10, well colour; icons 17px | 65 × 47pt tiles, radius 14, gap 8 ([ORBE]) |
| Space title | 11.5px, weight 600, letter-spacing 0.01em; colour is a muted theme ink (`#AA4D52` on coral) | None |
| Tab row | 38px tall, radius 9; icon box 18px; 11.7px from icon to title; left padding 9.6px; text 14px, weight 500, line-height 17px | 41pt pitch ([MENUS], [ORBE]); about 14pt ([ORBE]) |
| Folder row | Weight 600. The folder icon is a 16px outline (stroke 1.5) in a folder colour (`#6E5DBF` here), with a white fill at 0.7 opacity; the open state adds a gradient. Nested rows are indented 15px more. | Indent 16pt ([ORBE]) |
| Divider | 0.75px line `rgba(120,0,20,.08)`, 15px above it, 13px below to Today | None |
| "+ New Tab" | Weight 400, muted colour, 14px "+" icon | None |
| Selected tab | Fill `#FFF5F4` (a white tinted by the theme), shadow `0 1px 3px rgba(120,0,20,.12)` plus a 0.5px ring | None |
| Web content card | Radius 8px, white, 0.5px ring plus `0 1px 4px` shadow | About 8pt ([MENUS]) |
| Footer | 36px tall: Library (archive-box) icon on the left, Space dots in the middle, "+" on the right. Dots are 6px, 6px apart; the current one is `rgba(0,0,0,.6)`, the rest `.18`. | Bottom bar at y≈775 ([MENUS]) |
| Icons | 16px line icons: stroke 1.5, round caps and joins; ink `rgba(0,0,0,.62)`, disabled `.22` | None |
| Sidebar width | 226.5px, with 8.4px padding on the left and 7.8px on the right | 228pt ([MENUS], [ORBE]) |

### 2.2 Theme colours in official images (sampled, approximate)

| Image | Colours | Tag | Source |
|---|---|---|---|
| theme-picker | A vertical gradient: coral `#E0858E` at the top, through `#CB759E`, to magenta-purple `#B1619E` at the bottom. Selected tab `#FCF3F3`. | observed (measured) | [IMG-THEME] |
| space-swiping | A diagonal gradient: amber `#F0BC46` at the top left to coral `#F26D73` at the bottom right. Selected tab `#FCF0EF`; Favorites tiles a darker well (`#ECAF4C`). | observed (measured) | [IMG-SWIPE] |
| space-swiping, second Space | Flat lavender `#C6C8FC`, with the frame's right edge at `#A9AFE9`. | observed (measured) | [VID-SWIPE] |
| zero-chrome | Neutral light grey: frame `#EEEEEE`, URL well `#E2E2E2`, Favorite tile `#E8E8E8`, selected tab `#FBFBFB`. With only one Space, the footer shows no Space dots. | observed (measured) | [IMG-ZERO] |
| Farewell replica | Coral `#FF8A91`, well `#F47B82` | documented | [ARC] |

The selected tab is always near-white with a faint tint of the Space colour. The URL field and Favorite tiles sit a step darker than the frame (inferred).

### 2.3 Theme Picker anatomy

| Detail | Tag | Source |
|---|---|---|
| A floating light-grey panel with rounded corners. Top to bottom: <br>- a three-icon appearance switch: stars = Automatic, sun = Light, moon = Dark <br>- a square colour field with a faint dot grid <br>- − and + buttons under the field to remove or add colours <br>- a row of 9 preset swatches between ‹ › paging arrows <br>- a squiggle slider (sine wave with a white pill thumb; the wave flattens to the right) next to a round knurled dial | documented (help text) / observed (image) | [SP-WB] [IMG-THEME] |
| The colour field holds up to three handles: one large primary dot and two smaller ones, each with a white ring. | observed | [IMG-THEME] [VID-THEME] |
| The squiggle slider is most likely Intensity and the dial Grain; reviewers call the dial a "grain dial". | inferred | [IMG-THEME] [SWEET] |
| Swatch colours, left to right (sampled from a compressed image): `#E9E9E9` (neutral), `#D8A6BD`, `#A183A1`, `#D67C76`, `#E19A74`, `#EDDA87`, `#97DFA6`, `#94BBD5`, `#6E7388`. More presets sit behind the arrows ("Space Themes V2 … more presets"). | observed (measured) / documented | [IMG-THEME] [RN22] |
| Dragging a dot recolours the whole window live, with no lag. In the video one handle circles the field: hue sweeps through the spectrum while lightness and saturation stay constant, which suggests angle = hue and distance = saturation. The second colour stays a muted blend. | observed (measured) / inferred | [VID-THEME] |
| The Light/Dark/Auto icons are small animations (Lottie files `sun.json`, `moon.json`, `automatic.json`). | observed-local | [LOCAL] |
| The window theme and the loading glow are drawn by Metal shaders (each bundle has a `default.metallib`). Grain is likely generated by a shader rather than an image tile. | observed-local / inferred | [LOCAL] |

### 2.4 Official CSS palette variable names

arc.net/colors.html is TBC's own test page for the variables Arc injects into web pages. The full list is below (documented, [COLORS] [RN22]).

- `--arc-palette-`: foregroundPrimary, foregroundSecondary, foregroundTertiary, maxContrastColor, minContrastColor, backgroundExtra, background, focus, hover, cutoutColor, title, subtitle
- `--arc-background-simple-color`
- `--arc-background-gradient-color0`, `color1`, `color2`
- `--arc-background-gradient-overlay-color0`, `color1`, `color2`

Correction to `visual-spec.md` §4: there are three gradient colours and three overlay colours, plus a "simple" colour, not two of each.

### 2.5 Sidebar micro-details from Arc's own onboarding clips

All rows below are observed, measured from [LOCAL], unless the row says otherwise.

| Detail | Tag |
|---|---|
| Hovering "+ New Tab" reveals its shortcut (⌘T) at the right end of the row. | observed |
| Hovering a Today tab shows "×". Hovering a pinned tab inside a folder shows "−" instead, because closing a pin unloads it but keeps it. | observed |
| Dragging a tab lifts the row into a floating white chip with a shadow, slightly offset from the pointer. The other rows slide to close the gap. | observed |
| Dragging over a folder fills the folder row with the Space's focus colour (purple, with white text) to show a drop into the folder. | observed |
| The divider carries a small "Clear" label on the right. It shows a "↓ Clear" arrow once there are Today tabs, and the label is hidden while empty. | observed |
| A collapsed Pinned section shows a "›" caret to the left of the Space title. | observed ([PT-IMG]) |
| A tab dragged onto the page shrinks the current page to the right and opens an empty drop zone (light grey, thin theme-tinted border) on the left. The chip morphs from a row into a small vertical card (favicon over title). | observed |
| In Split View, the focused pane gets a thin theme-coloured outline. A small grip sits on the divider between panes. The sidebar shows the split as one row of two side-by-side chips, each with its own favicon and short title. | observed |

### 2.6 Command Bar look

All rows are observed, measured from the new_tab onboarding clip ([LOCAL]).

| Detail | Tag |
|---|---|
| Opened from "+ New Tab", the bar is centred on the whole window, not just the page card. It is about 74% of the window's width (in a demo window of about 960 × 600pt), with its top about 24% down. A width cap on larger windows is likely but unmeasured. | observed (measured) / inferred |
| White card, rounded corners, large soft shadow. Input row: a magnifier and "Search or Enter URL…" placeholder, with a small circular icon on the right. | observed |
| Result rows: favicon and title. <br>- Open tabs show "Switch to Tab" and an arrow in a small rounded square on the right. <br>- Tabs in another Space show that Space's name ("Work") instead. <br>- Built-in actions such as "Ask Question" show their own icon. | observed |
| The selected row is filled with the Space's focus colour (lavender/purple) and its text turns white. | observed |
| It opens and closes in a single frame at 60 fps, with no fade or scale. | observed (measured) |

### 2.7 Little Arc look

From the help-center GIF [LA-GIF]; both rows observed.

| Detail | Tag |
|---|---|
| A single slim title strip, left to right: <br>- greyed traffic lights <br>- a magnifier (search) <br>- the centred domain <br>- the Site Control Center (sliders) and copy-link icons <br>- an "Open in Personal ⌘O" pill naming the target Space, plus a chevron for choosing another Space | observed |
| The window frame is tinted with the target Space's colour. The window is fairly large, about two thirds the size of the Slack window it opened from. A forum user also calls it "not little at all". | observed ([ORP]) |

### 2.8 Welcome / onboarding flow (not in `features.md`)

| Step | Tag | Source |
|---|---|---|
| 1. Launch plays a sound; the screen reads "Meet the internet again." with an arrow button. A later version used "A browser for you". | observed | [GIGA] [CFG] |
| 2. Account: nickname, email, password, and terms. The right half previews rotating example Spaces: <br>- green (Inspo, Bauhaus moodboard) <br>- coral (Read Later, Shopping Trip Planning, MMMHome) <br>- blue (Mood Boarding with Photo Gallery) | observed | [GIGA] [CFG] |
| 3. Import: choose a browser and profile (several profiles at once since Aug 2023), then passwords through a Keychain prompt, then bookmarks. The password step was criticised as hard to skip. | observed / documented | [GIGA] [RN23] [DD] |
| 4. Pick the Space colour: a solid or a gradient. The designers treated it as an early "little win" borrowed from game pacing. | documented | [INV] [GIGA] |
| 5. Choose Favorites (Gmail, Calendar, Spotify, YouTube and so on), then sign in with Google so Previews work. | observed | [GIGA] |
| 6. Ad blocking prompt with "Yes" preselected. It installed uBlock Origin; Manifest V3 later broke that, and TBC said a built-in blocker was coming (there is an `AdBlocking` module in Arc.app). | observed / documented | [GIGA] [WR] [MV3] [MENUS] |
| 7. Default browser prompt; Arc Max opt-in since Nov 2023. | observed / documented | [GIGA] [RN23] |
| 8. Membership card: the nickname gets a revealed "second name", then "Go Explore". The card lives in Settings > Account (view, download, customise), and gained anniversary stickers in May 2024. Reviewers found it puzzling ("Arc Card"). | observed / documented | [GIGA] [RN22] [RN24] [CS] [PCW] |
| 9. First window: a blank tab, plus two pinned folders of help articles (pinned tabs, Spaces, Split View, shortcuts). | observed | [CS] |
| The in-app tutorial clips cover exactly four skills: new tab, pinning, Space swiping, and Split View. | observed-local | [LOCAL] |
| Design intent: <br>- a "gift-opening" first run with a "radiating blast" of colour, like a film opening <br>- built after most of the product, by working back from what needed explaining | documented | [INV] |

### 2.9 Peek and Mini Player

I found no public visual detail beyond what `visual-spec.md` already has.

---

## 3. Motion and feel

### 3.1 Stated principles

| Principle | Tag | Source |
|---|---|---|
| Colour and lighting are inseparable. A "gently lit frame" surrounds the browser like a theatre scrim (inspired by Robert Irwin), and colour extends into the sidebar. | documented | [INV] |
| The browser is a "room" with a backdrop that should feel like home. The design lead (Dustin Senos) said: "We're trying to mold to the user, rather than being an agnostic window." | documented | [INV] |
| Founding designer Nate Parrott's team favoured distinctive "fingerprints" over strict consistency, with a heavy prototyping culture. | documented | [DIVE] |
| The 2025 letter to members says Arc had "taste, care, feeling", like a product from Nintendo or Disney, and that members should feel "this is mine". | documented | [LTR] |

### 3.2 Numbers stated by a source

- Hovering a link for **1.5 s** expands the status bar from a preview to the full URL (Apr 2023) (documented, [RN23]).
- Toasts were restyled in Jan 2024 with theme colouring and "new animations". No values were given (documented, [RN24]).
- No source states any spring, damping or duration value for the Arc app. TBC's own website uses `cubic-bezier(0.16,1,0.3,1)` at 0.22s, which is web-only and only a hint of house taste (inferred, [ARC]).

### 3.3 Durations measured from official videos

All rows are observed (measured). Marketing videos may be retimed, so treat these as targets to confirm in the app.

| Motion | Measured | Shape | Source |
|---|---|---|---|
| Hide sidebar (⌘S) | About 0.28 s | Strong ease-out: about 30% of the travel in the first 33 ms, about 94% by 0.22 s, no overshoot. The page card widens continuously (it reflows) while the sidebar contents fade and slide out. | [VID-ZERO] (30 fps) |
| Show sidebar | About 0.40 s | Slower start (about 15% at 50 ms), long soft settle, no overshoot. Consistent with a critically damped spring of response about 0.3–0.4 s (inferred). | [VID-ZERO] |
| Space swipe on the trackpad | About 0.33–0.42 s | The whole window's theme colour, frame included, interpolates. The sidebar lists move like a horizontal pager: the old list exits left, the new one enters from the right. The traffic-light row and footer stay fixed. | [VID-SWIPE] (30 fps) |
| Space switch by clicking a footer icon | About 170 ms for the list slide | The web content and URL change instantly on the click frame; only the sidebar list slides, with a decaying tail. | [LOCAL] (60 fps) |
| Command Bar open and close | 1 frame | No animation. | [LOCAL] |
| Split drop preview opening | About 200 ms | Exponential ease-out over 12 frames: the page shrinks aside while the drag chip morphs into a card. | [LOCAL] |
| Theme change while dragging | Live | Follows the pointer frame by frame, with no tween. | [VID-THEME] |
| Little Arc pop-in | Under 140 ms | The window is fully shown within one or two 70 ms GIF frames, which is too coarse to time. | [LA-GIF] |

### 3.4 Small delights from the release notes

These are documented ([RN22] [RN23] [RN24]) and missing from `visual-spec.md` §6:

- 2022: a new restart-window animation; a refreshed updater with "a fresh coat of paint and delight"; animated music notes on audible music Favorites.
- 2023: a brand-new Space Creation flow (Aug 2023) built for "customization, profile selection, and delight"; an improved animation for dropping a tab into a folder (Apr 2023); and polished Mini Player animations and haptics (Apr 2023).
- 2024: the update banner collapses and expands on hover, with a gradient button (May 2024); the link status pill moves out of the way when the pointer comes near it (Jan 2024).

### 3.5 Sound and the loading glow

| Detail | Tag | Source |
|---|---|---|
| Arc.app bundles only two UI sounds: `event.m4a` (about 3.5 s, stereo AAC) and `capture.wav` (about 0.63 s). Most likely the first is the launch/onboarding sound and the second the Capture shutter. Design our own sounds. | observed-local / inferred | [LOCAL] [GIGA] |
| The top-centre loading glow (Apr 2023) is a GPU shader effect, not an image or Lottie file. | documented / observed-local | [RN23] [LOCAL] |

---

## 4. Shortcuts and behaviours missing from `features.md`

| Item | Tag | Source |
|---|---|---|
| Stop loading: Esc, or double-click the reload icon (Sep 2023). | documented | [RN23] |
| Link status bar: full URL after a 1.5 s hover; the pill dodges the pointer. | documented | [RN23] [RN24] |
| Translate: the URL bar offers translate / un-translate on foreign-language sites (May 2023), and the toolbar shows translation prompts (Sep 2023). Esc closes the Translate popup. | documented | [RN23] |
| Restore Data: Help > Restore Data, or "Restore Data" in the Command Bar, brings back earlier versions of the sidebar (snapshots). | documented | [CMD] [MENUS] |
| Window > Stay On Top keeps an Arc window above other apps. It is listed in the menu but not in features. | observed | [MENUS] |
| Edit > Copy URL as Quote, alongside Copy URL and Copy URL as Markdown. | observed | [MENUS] |
| Settings > Advanced > Export Data saves Spaces and tabs as a list of links (added for the sunset). This is the format Radian's "import from Arc" must read. | documented | [ARC] |
| Built-in ad blocking: an onboarding choice, implemented first as uBlock Origin, then as a native blocker after MV3. | observed / documented | [GIGA] [MV3] [WR] |
| Command Bar actions not listed in features: Reset Space (reset every pin in the Space), Replace Pin with Current Page, Switch to Light/Dark Mode, Report Bug or Feedback, Join Call, Common Shortcuts. | documented | [CMD] |
| Cmd+Shift+[ / ] for previous / next tab. | observed (3P) | [HK] |
| Cmd+Shift+L for Library. Two third parties now agree, up from "unverified" in features. | observed (3P) | [HK] [ATH-KS] |
| Cmd+E opens an extension. Old notes also used Cmd+E for Capture and New Easel. Unverified for current builds. | observed (3P) / documented (old) | [HK] [RN21] [RN22] |
| Chromium/macOS defaults Arc keeps: <br>- Cmd+Opt+U view source <br>- Cmd+Opt+J console <br>- Cmd+Opt+C inspect <br>- Cmd+Shift+S Save Page As <br>- Cmd+P Print <br>- Cmd+Opt+Shift+V paste and match style <br>- Cmd+H / Cmd+M / Cmd+Q | observed (3P) | [HK] |
| The copy-URL toast also sits beside a one-click copy icon in the URL row. Both are already covered by #45; nothing new. | n/a | None |

Everything else in the brief (Cmd+Shift+C toast, Ctrl+Tab switcher, Air Traffic Control, auto-archive defaults, Boosts, Easels, Notes, Library, Mini Player, Little Arc routing) is already in `features.md`.

---

## 5. Sunset: what users say they'll miss

### 5.1 Official facts

| Fact | Tag | Source |
|---|---|---|
| Timeline: <br>- Oct 22, 2026: no new accounts <br>- Nov 23: Arc Search loses AI and sync <br>- Dec 22: Arc for Mac and Windows stops working; accounts deactivated, data deleted within 30 days <br>- Dec 15: last day for data requests | documented | [ARC] [SUN] [TC26] |
| Dia equivalents: Spaces become Profiles (with swipe between them), Folders become Tab Groups, and Sidebar tabs are optional. The page's Dia mock still shows swipeable profile dots. | documented | [ARC] |
| On open-sourcing: CEO Josh Miller said Arc sits on ADK, the same proprietary SDK that powers Dia, so Arc cannot be open-sourced meaningfully on its own. Many users renewed the open-source request. | documented | [TC26] |
| Feature usage from the May 2025 letter, as a share of daily users: Spaces (more than one) 5.52%, Live Folders 4.17%, Calendar hover preview 0.4%. | documented | [LTR] |

### 5.2 What users name

From the HN thread on the farewell page (193 points, 151 comments) plus news and blog comments:

| Feature named | Who | Tag | Source |
|---|---|---|---|
| Peek, Air Traffic Control, nested folders. Named twice by the same user as the things Dia still lacks. | HN commenter | observed | [HN] |
| Little Arc floating windows: the one feature press coverage says Dia lacks | piunikaweb, DEV | observed | [PIU] [DEVK] |
| Auto-hiding sidebar, pins, smart folders, split tabs, Command Bar | HN commenter | observed | [HN] |
| Tidy, Clear, screenshot capture, and the shortcuts ("felt a complete browser") | HN commenter | observed | [HN] |
| Boosts | HN commenter | observed | [HN] |
| Swiping between Spaces | Digital Trends | observed | [DT] |
| Easel; asking which Space a link should open in; Space switching | TidBITS readers | observed | [TIDB] |
| The sidebar first, then Spaces, Command Bar, auto-archive, Split View. This is a vendor blog. | SupaSidebar | observed | [SUPA] |

Where people are going:

- Zen is named far more often than anything else, followed by Helium, Crest, Orion, Vivaldi, and Safari with SupaSidebar plus OpenIn ([HN]).
- One user reported that Arc-to-Dia import failed ([HN]).
- People who stay with Dia praise its "Arc feel" but call it half-finished ([HN]).

---

## Priorities for Radian

1. **Feel of the frame and sidebar (P0).** Match the §2.1 replica values: 10pt inset, 10px window radius, 8px card radius, 35–36pt URL well, 38pt rows on a 41pt pitch, 14pt/500 titles, near-white tinted selected row, 0.06-opacity grain. These are what screenshots get judged on.
2. **Sidebar hide/show and Space swipe motion (P0).** Hide about 0.28 s with a strong ease-out; show about 0.4 s with a soft settle; no overshoot. On trackpad swipe, interpolate the theme colour across the whole window; on click, cut the content and slide only the list (about 170 ms). Never animate the Command Bar.
3. **Peek, Little Arc and Air Traffic Control (P0).** These are the features departing users name most and Dia lacks. Little Arc's "Open in ‹Space› ⌘O" pill and frame tinted to the target Space are the visual hooks.
4. **Theme Picker (P0).** Live recolour while dragging, up to three handles, nine presets with paging, Light/Auto/Dark icons, an intensity squiggle and a grain dial. Expose all `--arc-*` variables from §2.4 (three gradient stops, three overlay stops, simple colour) so existing Boosts keep working.
5. **Import from Arc's Export Data and from Arc's local data (P0).** Account creation closed on Oct 22 and Dia import fails for some users. Radian should need no account (inferred).
6. **Nested folders, Tidy/Clear, Capture, Boosts and Split View polish (P1).** Pinned rows hover "−", Today rows hover "×", folders highlight in the focus colour on drop, and the drag chip morphs into a card for split.
7. **Onboarding (P1).** Short and colourful: import, then pick a colour as an early win, then Favorites, then default browser, then teach new tab, pinning, Space swipe and split. Skip the account wall and the membership card, which reviewers found confusing.
8. **Small delights (P2).** Status pill that dodges the pointer and shows the full URL after 1.5 s; Esc or double-click reload to stop; translate prompt in the URL row; a restart animation; our own two sounds (launch and capture).
9. **Brand (P2).** Radian needs an original mark. Do not echo Arc's woven-stroke "A" or its coral/blue/pink palette.

---

## Sources

Official (TBC / arc.net):

[ARC]: https://arc.net/
[ARC-CSS]: https://arc.net/_next/static/css/86f636fb0a73859d.css
[ARCDL]: https://arc.net/download
[LOGO-C]: https://arc.net/farewell/assets/arc-logo/color.svg
[LOGO-O]: https://arc.net/farewell/assets/arc-logo/outline.svg
[COLORS]: https://arc.net/colors.html
[WB25]: https://web.archive.org/web/20250531172436/https://arc.net/
[WB23]: https://web.archive.org/web/20230731191402/https://arc.net/
[WBMAX]: https://web.archive.org/web/20250310160815/https://arc.net/max
[IMG-THEME]: https://web.archive.org/web/20250531172436im_/https://arc.net/_next/image?url=%2Ftheme-picker.png&w=1920&q=100
[IMG-SWIPE]: https://web.archive.org/web/20250531172436im_/https://arc.net/_next/image?url=%2Fspace-swiping.png&w=1920&q=100
[IMG-ZERO]: https://web.archive.org/web/20250531172436im_/https://arc.net/_next/image?url=%2Fzero-chrome.png&w=1920&q=100
[ICON]: https://web.archive.org/web/20250531172436im_/https://arc.net/app-icon-desktop.png
[VID-THEME]: https://web.archive.org/web/20230731191402im_/https://arc.net/theme-picker.mp4
[VID-SWIPE]: https://web.archive.org/web/20230731191402im_/https://arc.net/space-swiping.mp4
[VID-ZERO]: https://web.archive.org/web/20230731191402im_/https://arc.net/zero-chrome.mp4
[LA-GIF]: https://web.archive.org/web/20251208133126im_/https://resources.arc.net/hc/article_attachments/25702141311127
[PT-IMG]: https://web.archive.org/web/20251202041552im_/https://resources.arc.net/hc/article_attachments/20509285257111
[SP-WB]: https://web.archive.org/web/20251128111324/https://resources.arc.net/hc/en-us/articles/19228064149143-Spaces-Distinct-Browsing-Areas
[CMD]: https://start.arc.net/command-bar-actions
[MV3]: https://resources.arc.net/hc/en-us/articles/25540117353623-What-Happens-to-Ad-Blocking-in-Arc-when-Google-upgrades-to-Manifest-V3
[RN21]: https://resources.arc.net/hc/en-us/articles/20498463803799
[RN22]: https://resources.arc.net/hc/en-us/articles/20498417809815-Arc-for-macOS-2022-Release-Notes
[RN23]: https://resources.arc.net/hc/en-us/articles/20498377604887-Arc-for-macOS-2023-Release-Notes
[RN24]: https://resources.arc.net/hc/en-us/articles/20498293324823-Arc-for-macOS-2024-2026-Release-Notes
[LTR]: https://browsercompany.substack.com/p/letter-to-arc-members-2025
[SUN]: https://resources.arc.net/hc/en-us/articles/44412972248471-Arc-Sunset-Key-Dates-and-What-to-Expect

Interviews and press:

[INV]: https://www.inverse.com/input/design/the-browser-company-arc-design-interview
[DIVE]: https://dive-club.beehiiv.com/p/fingerprints
[TC26]: https://techcrunch.com/2026/10/22/arc-browser-sunsets-december-22-as-the-browser-company-doubles-down-on-dia/
[DT]: https://www.digitaltrends.com/computing/arc-browser-is-shutting-down-in-december-long-live-ya-trailblazer/
[PIU]: https://piunikaweb.com/2026/10/13/arc-might-soon-be-abandoned-as-atlassian-pushes-users-towards-dia/
[TIDB]: https://tidbits.com/2025/06/20/dia-browser-debuts-with-contextual-ai-chat-but-arc-users-feel-left-behind/
[GIGA]: https://www.gigazine.net/gsc_news/en/20230727-arc-web-browser
[CFG]: https://computingforgeeks.com/install-arc-browser-macos-windows/
[CS]: https://chromestory.com/2024/06/installing-arc-on-windows/
[PCW]: https://www.pcworld.com/article/2319715/arc-browser-for-windows-hands-on-too-twee-for-me.html
[DD]: https://bunny.deceptive.design/articles/arc-browsers-pushy-account-requirements
[WR]: https://windowsreport.com/arc-browser-ad-blocker/
[FM]: https://www.myfonts.com/fonts/fontmesa/marlin-soft

Community (third party):

[HN]: https://news.ycombinator.com/item?id=50197601 (also https://news.ycombinator.com/item?id=50200947)
[SUPA]: https://supasidebar.com/blog/switching-from-arc-browser
[DEVK]: https://dev.to/kami_butt_69b922ade8de012/arc-is-dead-its-obituary-reads-like-a-contract-negotiation-o0m
[HK]: https://hongkiat.com/blog/arc-browser-keyboard-shortcuts
[ATH-KS]: https://allthings.how/arc-keyboard-shortcuts-for-mac
[ORP]: https://orionfeedback.org/d/4610-open-different-domains-in-popup-similar-to-arcs-peek
[SWEET]: https://thesweetsetup.com/first-look-arc-browser/

Local and in-repo:

[LOCAL]: /Applications/Arc.app (1.170.0). File names and media properties only, read from `ARC_SoundEffects`, `ARC_GlowProgressLoadingIndicator`, `ARC_WindowThemeUI`, `ARC_SpaceStyleEditor` and `ARC_WelcomeToArcFeature` (its onboarding clips were frame-analysed in a temp folder). Nothing was copied into the repo.
[MENUS]: parity/menus.md
[ORBE]: docs/analyse-arc.md
