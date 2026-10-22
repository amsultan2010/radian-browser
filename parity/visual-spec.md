# Arc for macOS: visual and feel spec for Radian

Every visual or feel detail I could find in public sources, paraphrased. Source keys match `features.md`; the ones used here are listed at the bottom.

## Tags

- **documented**: an official Arc source (help center, release notes, arc.net pages).
- **observed**: described in reviews or forums.
- **not Arc**: a number from a fan recreation, given only as a starting placeholder.

## Key gap

No public source gives measured pixel sizes, corner radii, margins, font sizes or animation timings for Arc.

Every number in section 9 has to be measured from the real app, through screen captures and REA's UI capture, before Arc stops working on 2026-12-22 ([SUN]).

---

## 1. Window structure

| Detail | Tag | Source |
|---|---|---|
| There is no top toolbar. Navigation, URL and tabs all live in a vertical sidebar on the left. | documented | [SP] [URL] [RN21] |
| The web page sits in an inset card with rounded corners. A margin of the theme-coloured window background shows around it, giving a frame look. | observed | [LR] [VIVF] [SWEET] |
| The window background and sidebar take the Space theme colour or gradient. Nothing official says this for the frame specifically. | observed | [SWEET] [OD] |
| The traffic lights sit at the top left, inside the sidebar. | observed | [SWEET] |
| When the sidebar is hidden, the window controls and top strip appear only on hover. | observed | [SWEET] |
| An optional classic toolbar can be shown with Cmd+Shift+D. Pinned extensions then move to its top right, and Split View shows each pane's URL in it. | documented | [URL] [EXT] [RN23] |
| The loading indicator moved over time. It started in the sidebar address bar (2021); since Feb 2023 it sits at the top centre of the window and stays visible in full screen. | documented | [RN21] [RN23] |
| The sidebar dims slightly when the window loses focus. | documented | [RN23] |
| While a window resizes, the area being revealed is filled with the website's own background colour, to avoid flashes. | documented | [RN24] |
| Incognito windows have a black frame and an "Incognito" label, shown in the sidebar only. | documented | [RN21] [RN23] |
| A Developer Mode tab gets a yellow-and-black outline and a full-URL bar across the top of the window. | documented | [DEV] |
| Developer Mode tabs get extra contrast in the sidebar. | documented | [RN22] |
| A new window with no tabs shows the Command Bar centred. | documented | [RN23] |
| Full-screen enter and exit use simplified animations, and there is no black bar on full-screen video. | documented | [RN23] |

## 2. Sidebar layout

| Detail | Tag | Source |
|---|---|---|
| **Order from top to bottom:** <br>1. URL row (back, forward, reload, URL, Site Control Center, pinned extensions) <br>2. Favorites grid <br>3. Space title <br>4. Pinned tabs and folders <br>5. Divider line <br>6. "+ New Tab" row <br>7. Today tabs <br>8. Bottom bar: Library icon (left), Space icons, "+" (right) | documented / observed | [FAV] [LIB] [SP] [RN22] [SWEET] |
| The URL row shows a shortened URL by default; full URL is an Advanced setting. | documented (setting) / inferred (default) | [URL] |
| Secure sites show no lock icon; insecure sites show a warning icon. | documented | [RN23] |
| A one-click copy-URL button sits in the URL row. | observed | [GIGA] |
| The Favorites grid holds up to 12 icon tiles and rearranges once there are more than 4. | documented | [FAV] [RN23] |
| Favorites per row: a fan clone uses 4, plus one more column per ~64px of extra width. | not Arc | [ARCF] |
| Favorite tiles can carry badges: app unread counts, an animated music note while playing audio, and a video-call sharing badge. | documented | [RN22] [RN23] |
| The Space title is plain text. Its edit, share and "…" controls appear only on hover. | documented | [RN23] |
| The Space title turns bold when Pinned is collapsed and the current tab is one of the hidden pins. | documented | [RN24] |
| The bottom bar shows the Space switcher as icons or emoji (dots when none is set). | documented / observed | [SP] [LR] |
| A tab row is a favicon plus a title, with an X on hover. A pinned tab that has navigated away shows "/" before its title. | documented | [SL] [RN22] |
| The selected tab has a highlighted (filled) row. Its look was refined in Aug 2023 and the tab spacing was tuned pixel by pixel in Dec 2023. | documented (no values) | [RN23] |
| A "Clear" control sits above the Today tabs, next to a broom icon (Tidy, shown on hover). The two were separated visually in May 2024. | documented | [RN23] [RN24] |
| An overflow indicator appears when the current tab scrolls out of view in the sidebar. | documented | [RN23] |
| The bottom of the sidebar stacks, as needed: <br>- the mini audio player (scrolling title) <br>- the media tray <br>- download progress (size, time left, cancel) <br>- a collapsed update banner that expands on hover <br>- a green sync dot | documented | [RN22] [RN23] [RN24] |
| Tabs using the mic, camera or screen recording show a more visible animated indicator, and a tab being screen-shared has its own indicator. | documented | [RN22] [RN23] |

## 3. Sidebar width and auto-hide

| Detail | Tag | Source |
|---|---|---|
| Resize by dragging the sidebar's edge. Double-clicking the edge resets the default width. | documented | [RN21] [RN22] |
| At narrow widths the back and forward buttons stay visible. | documented | [RN22] |
| Dragging the edge fully left collapses the sidebar. | documented | [RN24] |
| Width limits exist, but no values are published (only stated for Windows). | documented (no values) | [WIN-RN] |
| Width placeholders: 200px (ArcWTF says this matches Arc), and 240px open per design write-ups. | not Arc | [ARCWTF] [BC] |
| Cmd+S hides the sidebar, and the page then takes the full window width. | documented | [HIDE] [KS] |
| While the sidebar is hidden, touching the left edge with the pointer slides it in as an overlay above the page, with no reflow. It slides back out when the pointer returns to the page. | observed | [OR] [MPU] [MOZ] |
| A 2021 behaviour: holding Option showed the sidebar temporarily. Preferences could turn it off. | documented (old) | [RN21] |

## 4. Space themes and colour

| Detail | Tag | Source |
|---|---|---|
| Each Space has its own theme. | documented | [SP] |
| How to open the theme picker: <br>- hover the Space title, then click edit (paintbrush) <br>- right-click empty sidebar <br>- type "Theme" in the Command Bar | documented | [SP] [RN22] |
| Picker contents: <br>- preset swatches <br>- up to 3 colours, blended as a gradient <br>- Intensity slider <br>- Grain (noise) slider <br>- Light/Dark/Auto | documented | [SP] [RN22] |
| How reviewers describe the picker UI: drag dots on a colour field to set hue and saturation, plus a grain dial and a luminosity control. | observed | [SWEET] [CAND] |
| Light/Dark/Auto applies to every Space, not just one. | documented | [MODE] |
| The picker gives haptic ticks on Force Touch trackpads. | documented | [RN22] |
| Deselecting every colour with (−) restores the default theme. | documented | [THEME] |
| Where the theme colours show: <br>- Command Bar, previews, menus, fields, settings <br>- toasts (Jan 2024) <br>- Ctrl+Tab switcher <br>- Split View drop indicator <br>- extensions/split menu <br>- Easels and Notes | documented | [RN22] [RN23] [RN24] |
| Space Themes V2 (Sep 2022) added more presets and dark-mode variants, with better dark-mode contrast. | documented | [RN22] |
| Arc expands each theme into a palette of named colours. This shows the colour roles a rebuild needs: <br>- title, subtitle <br>- background, backgroundExtra <br>- foreground primary, secondary, tertiary <br>- focus, hover, cutout <br>- min-contrast, max-contrast <br>- two gradient colours and two gradient-overlay colours | observed | [UAT] |

## 5. Overlays: Command Bar, Peek, Split, Little Arc, Mini Player, toasts

| Detail | Tag | Source |
|---|---|---|
| The Command Bar floats centred over the page, Spotlight-style, tinted with the Space theme. It got a visual refresh in Aug 2023. | documented / observed | [RN21] [RN22] [RN23] [WIKI] |
| Shortcut tooltips: hovering a control shows a custom tooltip with its keyboard shortcut. | documented | [RN22] |
| Peek is a floating, rounded window over the current page; whether the page behind is dimmed is unverified. It has expand, open-as-split and close controls, and an interactive dismiss gesture (drag to dismiss). | documented / observed | [RN23] [VIV] |
| Split View panes sit side by side or stacked, with a draggable divider. <br>- Each pane has a hover-revealed control strip at the top, with a three-dot menu at the top right. <br>- The sidebar shows the split as one item. | documented | [SV] [RN21] [RN22] [WIN-RN] |
| Little Arc is a small, sidebar-less floating window with an "Open In" button at the top. It sits above full-screen apps. Its opening animation was refined in Oct 2023. | documented | [LA] [RN23] |
| The video Mini Player floats at the bottom right of the screen and snaps to corners when flicked. It resizes by corner drag or pinch, and its controls show on hover. | documented / observed | [MP] [RN22] |
| A "Back to PiP" control animates out of the sidebar mini audio player. | documented | [RN23] |
| Toasts (copy URL and similar) use the theme colours and appear above the right Split View pane. Users describe the copy-URL toast as large, at the top right, with a Share button. | documented / observed | [RN22] [RN24] [ORT] |
| A link status bar appears on hover (Apr 2022 redesign). | documented | [RN22] |

## 6. Motion and animation

None of these have published timings. The descriptions below say only what moves.

| Detail | Tag | Source |
|---|---|---|
| Space switch: a two-finger horizontal swipe on the sidebar slides between Spaces, and the bottom Space icon animates with it (Nov 2023). | documented | [SP] [RN23] |
| Back and forward use a Chromium-style arrow overscroll; the page itself does not slide. | observed | [ORS] |
| Clearing Today tabs (Cmd+Shift+K) has its own animation, improved in Nov 2023. | documented | [RN23] |
| The "+" and close-tab buttons animate (May 2022), as do refresh, back and forward (Apr 2022). | documented | [RN22] |
| Startup plays a shimmer animation (May 2022). | documented | [RN22] |
| Tab drag and drop got snappier in Oct 2023, with light haptics while dragging. | documented | [RN23] |
| Peek animation and dismiss gesture improved in Mar 2023. | documented | [RN23] |
| Download animations: several can run at once. What they look like is undocumented. | documented | [RN23] |
| Placeholder timings: hover 200ms, tab open/close 320ms, Little Arc 480ms, easing cubic-bezier(0.32,0.72,0,1); sidebar 0.2s ease-out; Space switch a spring with response 0.3 and damping 0.7. | not Arc | [OD] [BC] |

## 7. Typography

| Detail | Tag | Source |
|---|---|---|
| UI text uses the macOS system font (SF). Monospace was replaced with the system font in May 2022. | documented | [RN22] |
| The address-bar font changed in Apr 2022, and Notes got a new font in Oct 2021. | documented (no names) | [RN21] [RN22] |
| Placeholder: tab titles at 13px, weight 500. | not Arc | [OD] |

## 8. Sound and haptics

| Detail | Tag | Source |
|---|---|---|
| Arc plays UI sounds, which a Settings > Advanced switch turns off. Which events play sounds is undocumented, so record them and make our own. | documented | [RN22] |
| Haptics fire on tab drag and in the theme picker. They are toggled under Advanced Preferences. | documented | [RN22] [RN23] |

## 9. To measure in Arc before 2026-12-22

Measure each of these in Arc 1.170.0, at 1x and 2x and in light and dark:

- **Sidebar width:** default, minimum and maximum.
- **Hover reveal:** the edge hot-zone width and the reveal and hide delays.
- **Content card:** the margin on every side, corner radius, shadow or border, and how these change with the sidebar hidden and in full screen.
- **Tab rows:** height, favicon size, title font size and weight, selected and hover fills, divider thickness and colour.
- **Favorites grid:** tile size, gaps, columns at each width.
- **Command Bar:** width, top offset, row height, corner radius, backdrop dimming.
- **Peek:** inset from the window, corner radius, backdrop.
- **Little Arc:** default window size and position.
- **Space swipe:** distance-to-commit threshold and spring behaviour.
- **Durations:** sidebar slide, tab close, Clear, Peek open and close, Little Arc pop-in, toast in and out.
- **Theme:** the exact grain texture scale and opacity, and how Intensity maps to colour.

---

## Sources used here

[SP]: https://resources.arc.net/hc/en-us/articles/19228064149143-Spaces-Distinct-Browsing-Areas
[URL]: https://resources.arc.net/hc/en-us/articles/25625458052247-How-Do-You-View-the-Full-URL-at-the-Top-of-the-Page-in-Arc-for-Desktop
[EXT]: https://resources.arc.net/hc/en-us/articles/25625617866263-How-Do-You-Move-Your-Pinned-Extensions-to-the-Top-Right
[FAV]: https://resources.arc.net/hc/en-us/articles/19230755904151-Favorites-Top-Tabs-Across-Every-Space
[LIB]: https://resources.arc.net/hc/en-us/articles/19230634389911-Library-A-home-for-your-downloads-archived-tabs-easels-and-more
[SL]: https://resources.arc.net/hc/en-us/articles/25625148480279-Why-is-There-a-Slash-Next-to-My-Pinned-Tab-s-Name
[HIDE]: https://resources.arc.net/hc/en-us/articles/25619487530519-How-Do-You-Hide-the-Sidebar
[KS]: https://resources.arc.net/hc/en-us/articles/20595231349911-Keyboard-Shortcuts
[DEV]: https://resources.arc.net/hc/en-us/articles/20468488031511-Developer-Mode-Instant-Dev-Tools
[SV]: https://resources.arc.net/hc/en-us/articles/19335393146775-Split-View-View-Multiple-Tabs-at-Once
[LA]: https://resources.arc.net/hc/en-us/articles/19235387524503-Little-Arc-Quick-Lookups-Instant-Triaging
[MP]: https://resources.arc.net/hc/en-us/articles/19234766331799-Mini-Player-Watch-or-Listen-as-you-Browse
[THEME]: https://resources.arc.net/hc/en-us/articles/25625261733143
[MODE]: https://resources.arc.net/hc/en-us/articles/25541642978583
[SUN]: https://resources.arc.net/hc/en-us/articles/44412972248471-Arc-Sunset-Key-Dates-and-What-to-Expect
[RN21]: https://resources.arc.net/hc/en-us/articles/20498463803799
[RN22]: https://resources.arc.net/hc/en-us/articles/20498417809815-Arc-for-macOS-2022-Release-Notes
[RN23]: https://resources.arc.net/hc/en-us/articles/20498377604887-Arc-for-macOS-2023-Release-Notes
[RN24]: https://resources.arc.net/hc/en-us/articles/20498293324823-Arc-for-macOS-2024-2026-Release-Notes
[WIN-RN]: https://resources.arc.net/hc/en-us/articles/22513842649623-Arc-for-Windows-2023-2026-Release-Notes
[WIKI]: https://en.wikipedia.org/wiki/Arc_(web_browser)
[LR]: https://blog.logrocket.com/ux-design/ux-analysis-arc-opera-edge/
[VIVF]: https://forum.vivaldi.net/post/743187
[VIV]: https://forum.vivaldi.net/post/741842
[SWEET]: https://thesweetsetup.com/first-look-arc-browser/
[GIGA]: https://gigazine.net/gsc_news/en/20230727-arc-web-browser
[CAND]: https://candid.technology/how-to-change-theme-on-arc-browser/
[OR]: https://orionfeedback.org/d/684-sidebar-openclose-on-hover
[ORS]: https://orionfeedback.org/d/1700-implement-chromefirefox-animation-for-page-back/21
[ORT]: https://orionfeedback.org/d/7732-would-love-toasts-for-actions-like-copy-url-shift-c
[MPU]: https://talk.macpowerusers.com/t/747-exploring-the-arc-browser/37408
[MOZ]: https://connect.mozilla.org/t5/discussions/vertical-tabs-close-the-gap-with-arc-s-sidebar-url-bound-pins/m-p/135309
[UAT]: https://github.com/1weiho/use-arc-theme
[ARCWTF]: https://github.com/kikaraage/arcwtf
[ARCF]: https://github.com/trajche/arc/releases
[OD]: https://open-design.ai/plugins/design-system-arc/
[BC]: https://blakecrosley.com/guides/design/arc
