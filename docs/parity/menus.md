# Arc menu bar (captured from Arc 1.170.0, read-only, 2026-10-22)

Shortcuts are not exposed by the capture; see features.md for documented shortcuts.

- **Arc**: About Arc · Settings… · Share Arc · Set as Default Browser · Import from Another Browser… · Check for Updates… · Services · Privacy Policy · Hide Arc · Hide Other Windows · Show All · Sign Out · Quit Arc
- **File**: New Tab… · New Window · Blank Window · New Incognito Window · New Little Arc Window · Restore Last Closed Tab · Open Command Bar · New Profile · New Note · New Easel · Close Window · Archive Tab · Share… · Send to Dia · Capture… · Capture Full Page · Capture in Portrait Mode · Save Page As · Print
- **Edit**: Undo · Redo · Cut · Copy · Copy URL · Copy URL as Markdown · Copy URL as Quote · Paste · Paste and Match Style · Delete · Select All · Find · Writing Tools · Spelling and Grammar · Substitutions · Transformations · Speech · Format · AutoFill · Start Dictation… · Emoji & Symbols
- **View**: Appearance · Show/Hide Sidebar · Stop Loading · Refresh the Page · Force Refresh the Page · Clear Cookies and Refresh · Clear Cache and Refresh · Add Split View · Close this Split Pane · Separate Page from Split View · Expand Current Split · Zoom to Actual Size · Zoom In · Zoom Out · Cast · Developer · Enter Full Screen
- **Spaces**: New Space… · Edit Theme… · Rename Space · Change Profile · Next Space · Previous Space · (one item per space) · Manage Spaces…
- **Tabs**: New Tab… · Pin/Unpin Tab · Open Little Arc or Peek in… · New Folder… · Next Tab · Previous Tab · Reveal Tab in Sidebar · Clear Unpinned Tabs · Reset all tabs in this Space
- **Archive**: Go Back · Go Forward · View History · View Archive · Clear Archive
- **Extensions**: Add Extension… · Manage Extensions…
- **Window**: Stay On Top · Minimize Window · Minimize All · Zoom · Zoom All · Fill · Center · Move & Resize · Full Screen Tile · View Library · View Downloads · View Easels & Notes · View Media · View Boosts · Bring All to Front · Arrange in Front · Remove Window from Set · (one item per window)
- **Help**: Getting Started · Essential Keyboard Shortcuts · Release Notes · Contact the Team · Visit Help Center · Restore Data · Export Arc Notes · Troubleshooting

## Window layout (measured from a 1280×800 pt window, default dark space theme)

- Traffic lights: close button frame at (12,16), 16×16; buttons 23 pt apart.
- Toolbar row: 32×32 buttons at y=8 — sidebar toggle x=77, back x=122, forward x=156, reload x=190.
- URL field: x 8–220, y 46–82 (36 tall), ~10 pt corner radius, faint white fill, magnifier icon + "Search or Enter URL…".
- Sidebar: 228 pt from window edge to web content; inner padding 8 pt.
- Web content: inset 10 pt top/right/bottom, starts at x=228, ~8 pt corner radius.
- Sidebar rows (space title, folder, "+ New Tab"): ~41 pt pitch, 16 pt icons, 15 pt semibold labels.
- Bottom bar (y≈775): library/archive icon left, space icons centred, "+" right.
- Background: space theme gradient (default dark purple) fills the whole window behind sidebar and content.

## Code modules (names of the resource bundles in Arc.app, one per feature)

AboutWindow, AdBlocking, AppTray, ArcMenu, ArcRichTextEditor, AskArc, AuthFeature, BaseHomeComponents, BoostsDialog, BoostsEditor, Capture, CommandBar, ContentPanel, ContextMenus, CustomInfoPicker, EaselUI, Emojis, Favicons, GlowProgressLoadingIndicator, HomeButton, ImportFeature, ImportMenuFeature, LittleBrowser, MediaControlsFeature, PictureInPicture, PreferencesFeature, ProfilesUI, SadTab, SharableObjectsFeature, SidebarBanner, SidebarPlusButton, SidebarSyncCloudKit, SiteControlCenter, SoftwareUpdaterClient, SoundEffects, SpaceCreation, SpaceStyleEditor, StorableSidebar, TextEditor, TopDomains, Translation, URLInputter, WebContentBehaviorConfigurationClient, WelcomeToArcFeature, WindowThemeUI.

## AppleScript dictionary (Arc.sdef — public scripting interface, used by Raycast/Alfred)

application (name, frontmost, version) → windows (id, name, index, active tab, active space, incognito, mode) → tabs (id, title, URL, loading, location: topApp/pinned/unpinned) and spaces (id, title). Commands: make, count, close, select, go back, go forward, reload, stop, execute (JavaScript), focus.
