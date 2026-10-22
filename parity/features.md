# Arc for macOS: feature inventory for Radian

Built from public sources only (October 2026). Paraphrased, never copied. Covers Arc for macOS up to 1.170.0.

## How to read this

- Each feature has five parts: what it does, how the user triggers it, defaults, edge cases, and sources. Source keys link to the list at the bottom.
- Third-party claims are marked "(3P)". Anything I could not confirm is marked "(unverified)".
- Most official help-center feature articles now return HTTP 403 to scripts, and many were pulled after the Arc sunset was announced on 2026-10-22. I read their content through search-engine summaries. The macOS release notes are still readable through the Zendesk API (`/api/v2/help_center/en-us/articles/<id>.json`) and are the strongest source here.
- Arc stops working on **2026-12-22** ([SUN]). Any behaviour marked unverified has to be checked in the real app before that date.

---

## A. Window, sidebar and chrome

### 1. Sidebar anatomy and the toolbar-less window
- What: There is no top toolbar. A vertical sidebar on the left holds, from top to bottom:
  - traffic lights, back/forward/reload and the URL row
  - the Favorites icon grid
  - the Space title
  - pinned tabs and folders
  - a divider
  - a "+ New Tab" row, then the Today (unpinned) tabs
  - at the very bottom: the Library icon (left), the Space switcher icons, and "+" (right)
- Trigger: Always present. The page sits to the right in an inset, rounded card.
- Defaults: The sidebar is shown in new windows ([RN21], Oct 2021).
- Edge cases:
  - Media players, download progress and the update banner all stack at the bottom of the sidebar.
  - The sidebar dims slightly when the window loses focus ([RN23], Oct 2023).
  - No option ever shipped to put the sidebar on the right. The CEO said it was prototyped and dropped ([JM], 3P).
- Sources: [SP] [FAV] [LIB] [RN21] [RN23] [SWEET] (3P)

### 2. Hide/show the sidebar and hover reveal
- What: Hides the sidebar so the page fills the window.
- Trigger:
  - Cmd+S, or "Toggle Sidebar" in the Command Bar.
  - Since Feb 2024, dragging the sidebar edge all the way left also collapses it.
- Defaults: Shown.
- Edge cases:
  - While hidden, moving the pointer to the left window edge slides the sidebar in as an overlay. The page does not reflow, and the sidebar slides away when the pointer leaves ([OR], [MPU], 3P).
  - Window controls appear only on hover while the sidebar is hidden ([SWEET], 3P).
  - Developer Mode keeps working with the sidebar hidden ([RN23]).
  - In 2021, holding Option peeked the sidebar, with a preference to turn that off ([RN21]). Whether this still exists is unverified.
- Sources: [HIDE] [KS] [RN24] [RN21]

### 3. Sidebar resize
- What: Sets the sidebar width.
- Trigger: Drag the sidebar edge. Double-click the edge to reset to the default width.
- Defaults: Standard width. The limits exist but the numbers were never published.
- Edge cases:
  - A narrow sidebar still keeps the back and forward buttons visible ([RN22]).
  - Dragging past the minimum width collapses the sidebar (see #2).
- Sources: [RN21] [RN22] [RN24]

### 4. URL row and optional top toolbar
- What: The URL row at the top of the sidebar shows the current site and the loading state.
  - Next to it: the Site Control Center button, pinned extensions, and a one-click copy-URL button ([GIGA], 3P).
  - Clicking the row, or pressing Cmd+L, opens the Command Bar pre-filled with the URL.
- Trigger:
  - Cmd+L edits the URL.
  - View > Show Toolbar (Cmd+Shift+D) adds a classic top toolbar. It moves pinned extensions to the top right and shows the URL of every Split View pane.
  - Settings > Advanced > show full URL.
- Defaults:
  - The toolbar is off and the row shows a shortened URL (inferred from the full-URL setting).
  - Secure sites show no lock icon; insecure sites show a warning icon ([RN23], Jun 2023).
- Edge cases:
  - Right-clicking the toolbar offers Copy URL, Capture and Share ([RN23]).
  - Long-pressing the back button lists tab history ([RN23]).
  - Since Apr 2024 the toolbar can also show inside Peek ([RN24]).
- Sources: [URL] [EXT] [RN23] [RN24]

### 5. Site Control Center
- What: A per-site panel opened from the sliders/info icon in the URL row. It contains:
  - permission toggles (location, camera, Picture in Picture and others)
  - clear cookies/cache for the site
  - Site Settings, including the Developer Mode checkbox
  - Capture and Capture Full Page
  - Boosts (paintbrush)
  - an Extensions section with manage, pin, and right-click "Remove from Arc"
- Trigger: Click the icon in the URL row.
- Defaults: The site's Chromium permissions.
- Edge cases: Option-clicking "Capture Full Page" gives a Portrait Mode capture ([RN24]).
- Sources: [MPOFF] [DEV] [FPC] [EXT2] [RN23] [RN24]

### 6. Command Bar
- What: A floating bar centred over the page. It is both the address bar and the launcher. It searches:
  - URLs and search suggestions
  - open tabs (choosing one switches to it), history and archived tabs
  - Spaces and folders ("Open [Folder]")
  - extensions
  - about 100 Arc actions: Pin, Split, New Space, Capture, Theme, View Archive, Open Library, Open Shortcuts, Duplicate, Collapse Pinned, Move to [Space], Manage Passwords, Share, and more ([CMD], [SWEET] 3P)
- Trigger:
  - Cmd+T opens it as "new tab". Cmd+L opens it on the current URL.
  - Pressing the same key again dismisses it.
  - Double-clicking empty sidebar space also opens it ([RN23], [ATIPS] 3P).
- Defaults:
  - Enter opens the result in a new tab at the top of Today in the current Space. A new window with no tabs opens with the bar centred.
  - Typing "/", or pressing Tab right after Cmd+T, filters to actions.
- Edge cases:
  - Cmd+L then Enter reloads the page.
  - Hover a suggestion and click X, or press Cmd+Opt+Delete, to delete it.
  - The sidebar stays clickable while the bar is open.
  - Results remember the order you used before ([RN24], Oct 2024).
  - Cmd+Opt+V pastes the clipboard URL as a new tab. "Paste and Go" was removed in Mar 2024.
  - Copying an address from the bar adds https automatically ([RN22]).
- Sources: [KS] [CMD] [RN22] [RN23] [RN24]

### 7. Site Search keywords
- What: Search a site directly from the Command Bar.
- Trigger: Type a keyword (for example "yt"), press Tab, type the query, then Enter.
- Defaults: Configured in the Command Bar under "Site Search Settings" with a URL template that uses %s. A toast suggests turning it on, and accepting that enables it for all Profiles ([RN23]).
- Edge cases: Typing "gpt" then Tab sends the query to ChatGPT ([RN23]).
- Sources: [SS] [RN23]

### 8. Window model
- What: Normal windows share the Space sidebar, so the same pinned and Today tabs appear in each one ([WINS]).
  - A tab lives in one window at a time. Selecting it in another window moves it there, so only one copy loads ("Tab Handoff", [RN23] Nov 2023).
  - A "Blank Window" is independent of the sidebar.
- Trigger:
  - Cmd+N opens a new window.
  - Ctrl+Cmd+N, or "New Blank Window" in the Command Bar, opens a blank window.
  - Dragging a tab out of the sidebar makes a new window, and the tab keeps its place.
- Defaults: A new window opens on the current Space and shows the sidebar.
- Edge cases:
  - Cmd+N in full screen opens the new window in full screen.
  - May 2023 notes say each window had its own unpinned tabs; Aug 2023 notes say unpinned tabs sync across windows. Treat the later note as current (unverified).
- Sources: [KS] [WINS] [RN22] [RN23] [RN24]

### 9. Incognito
- What: A private window with no history and no access to Spaces.
- Trigger: Cmd+Shift+N, File > New Incognito Window, or the Dock menu.
- Defaults: A dark/black frame, with an "Incognito" label in the sidebar only ([RN23], Aug 2023).
- Edge cases: Captures taken in Incognito can still be saved to an Easel ([RN23]).
- Sources: [INC] [RN21] [RN23]

### 10. Window drag regions and focus dimming
- What: The window can be dragged from empty sidebar space ([RN22]) and from the top strip of web pages ([RN23], May 2023).
- Trigger: Click and drag.
- Defaults: Page-top dragging is on. Holding Cmd suspends it, and a setting turns it off.
- Edge cases: The sidebar dims when the window is unfocused.
- Sources: [RN22] [RN23]

### 11. Full-screen behaviour
- What: Full screen hides the sidebar chrome. New windows open full screen while Arc is full screen.
- Trigger: Ctrl+Cmd+F.
- Defaults: Esc goes to the website first, so a stray Esc does not exit full screen. The priority can be remapped in Shortcuts ([RN23], Oct 2023).
- Edge cases:
  - Esc closes Peek.
  - The loading indicator stays visible in full screen.
  - Little Arc always appears above a full-screen window.
- Sources: [RN23] [RN24] [HK] (3P)

---

## B. Tabs

### 12. Today (unpinned) section and new-tab placement
- What: Everything below the divider is temporary and auto-archives (see #15).
- Trigger: Cmd+T, the "+ New Tab" row, or clicking a link that opens a new tab.
- Defaults:
  - New tabs go to the top of Today, directly under "+ New Tab".
  - A link opened from a page goes directly below its parent tab ([TW], [AT] 3P). There is no setting to change this.
- Edge cases:
  - Dragging text into the sidebar creates a search tab ([RN23]).
  - Tabs that play media, or use the mic or camera, are never suspended, archived or cleared ([RN22]).
- Sources: [MAX] [AT] [TW] (3P) [RN22] [RN23]

### 13. Closing, archive-on-close and reopen
- What: Closing a tab sends it to the Archive rather than deleting it.
- Trigger:
  - Cmd+W, or the hover X on the tab.
  - Cmd+Shift+T, or Cmd+Z, reopens the last closed tab with its history. This also works for Peeks.
- Defaults: Cmd+W on several Cmd-clicked tabs closes all of them ([RN22]).
- Edge cases:
  - Cmd+W on a pinned tab or Favorite unloads it, but it stays in the sidebar ([TB], 3P; unverified).
  - Cmd+W closes a Peek, and closes the Little Arc quick-lookup menu.
  - Closing a completely empty Note deleted it instead of archiving it.
- Sources: [KS] [RN21] [RN22] [RN23] [RN24] [TB] (3P)

### 14. Clear Today and Archive Below
- What: Archives all Today tabs at once.
- Trigger:
  - Cmd+Shift+K, the "Clear" button above Today, or "Clear Today" in the Command Bar.
  - Right-click a tab > "Archive tabs below" archives only the tabs below it.
- Defaults: Pinned tabs and folders are untouched. The clear has its own animation ([RN23]).
- Edge cases:
  - Media-playing tabs are not cleared.
  - Cmd+Z undoes a clear ([RN21]).
  - In May 2024 the Clear and broom (Tidy) buttons were separated visually.
- Sources: [KS] [CMD] [RN21] [RN22] [RN23] [RN24]

### 15. Auto-archive
- What: Today tabs that have not been touched for a set time move to the Archive by themselves.
- Trigger: Automatic. Viewing or clicking a tab resets its timer.
- Defaults:
  - 12 hours.
  - Set per Profile in Settings > Profiles > "Archive tabs after". The range is 12 hours to 30 days; the presets 12h/24h/7d/30d come from a third party.
  - It cannot be turned off.
- Edge cases:
  - Never applies to pinned tabs, folders, Favorites, or tabs playing media.
  - Little Arc windows have their own timer, 6 hours by default.
  - Downloads auto-archive too ([RN22]).
  - The archive timing syncs across devices ([RN23]).
- Sources: [ARCH] [PR] [RN21] [RN23] [RN24] [IW] (3P)

### 16. Archive view and restore
- What: A searchable list of every closed and auto-archived tab across Spaces.
- Trigger:
  - "View Archive" in the Command Bar, Archive > View Archive in the menu bar, or Library > Archived Tabs.
  - Click the Restore icon to bring a tab back.
- Defaults: A restored tab returns to its original Space (Nov 2023) as a Today tab, and follows Air Traffic Control routes.
- Edge cases:
  - The list can be filtered to Little Arc links.
  - Cmd+W closes a previewed item.
  - Archive > Clear Archive asks for confirmation first.
- Sources: [ARCH] [LIB] [CMD] [RN23]

### 17. Pinned tabs
- What: Persistent tabs that sit above the divider. Each belongs to one Space, can be grouped in folders, never auto-archives, and syncs across windows and devices.
- Trigger:
  - Pin by dragging a tab above the divider, Cmd+D (a toggle), or "Pin Tab" / "Pin to [Space/Folder]" in the Command Bar.
  - Unpin by dragging the tab below the divider, or Cmd+D.
- Defaults:
  - Navigating away from the pinned URL puts a "/" before the tab name.
  - Hovering the favicon shows "Back to Pinned URL"; clicking it resets the tab.
  - Cmd-clicking the favicon resets the tab and opens the current page in a new Today tab ([RN24], Feb 2024).
- Edge cases:
  - Same-domain links stay in the tab. Links to another domain, or links that would open a new tab, open in Peek (#31).
  - Other reset actions: "Reset Tab" and "Reset Space" (every pin in the Space). To change the pin: "Replace Pin with Current Page", or right-click > Edit Pinned URL.
  - A "Reset Tabs" shortcut exists but is unbound by default ([RN22]).
  - An inactive pinned tab unloads and returns to its pinned URL, losing its history ([TB], 3P).
  - Since Mar 2024, pinning no longer prompts a rename.
- Sources: [PT] [SL] [REV] [CMD] [RN22] [RN23] [RN24] [AP] [TB] (3P)

### 18. Collapse pinned section
- What: Folds the whole pinned area of a Space so only Today shows.
- Trigger: Click the Space title area, or "Collapse Pinned" / "Expand Pinned" in the Command Bar.
- Defaults: Expanded.
- Edge cases:
  - Sidebar keyboard navigation skips a collapsed section.
  - When the current tab is a pinned tab hidden by the collapse, the Space header turns bold ([RN24]).
- Sources: [PT] [RN24]

### 19. Favorites
- What: A grid of icon tiles at the top of the sidebar, shown in every Space of the same Profile.
- Trigger:
  - Add by dragging a tab above the Space title, "Favorite Tab" in the Command Bar, or right-click > Move To > Favorites.
  - Remove by dragging a tile below the Space title.
- Defaults:
  - Up to 12 per Profile (raised from 8 in Jan 2023).
  - A tile only keeps its page loaded if it was used recently.
  - Cmd+1 to Cmd+9 count Favorites first. A Shortcuts option, "Include Favorites in Ordering", turns that off ([RN22]).
- Edge cases:
  - Favorites reset to their saved URL like pinned tabs, and their links open in Peek.
  - Badges:
    - unread/app badges for Slack, Gmail, Calendar and X
    - an animated music-note icon while a Favorite plays audio
    - a badge while the tab is shared to a video call
  - The grid layout changes once there are more than 4 tiles.
  - Favorites do not sync.
  - Zero Favorites is allowed.
- Sources: [FAV] [REV] [PR] [SYNC] [RN22] [RN23]

### 20. Folders
- What: Collapsible groups inside the pinned area.
- Trigger:
  - "+" > New Folder, "New Folder" in the Command Bar, or Cmd-click several tabs then right-click > New Folder.
  - Drag tabs in and out of a folder.
  - To nest: Shift-click tabs inside a folder, then right-click > new folder.
- Defaults:
  - A new folder is named "Untitled".
  - Folders never auto-archive.
  - Moving a tab into a folder "peeks" it, so you stay on it.
- Edge cases:
  - Opening a tab from a collapsed folder shows just that tab under the folder.
  - Hovering the folder's magnifying glass previews and searches its tabs.
  - Right-click actions: Change Icon, Duplicate, Paste URL as New Tab, Copy All Links (includes nested folders).
  - A closed folder does not expand when something is dragged over it.
  - Clicking outside the rename field saves the name.
- Sources: [FO] [RN22] [RN23] [RN24] [AP] (3P)

### 21. Live Folders (GitHub)
- What: A folder that fills itself with your GitHub pull requests and review requests. Finished PRs drop out automatically.
- Trigger:
  - Created automatically when you open a PR.
  - Or manually: right-click the sidebar > Live Folders > GitHub ([AL], 3P).
- Defaults: Right-click to filter by Created by Me, Drafts, a repo, or team review requests.
- Edge cases:
  - Self-hosted GitHub Enterprise does not work.
  - A collapsed folder briefly surfaces when a new item arrives (3P).
  - "Delete Live Folder" stops automatic creation.
- Sources: [LF] [RN24] [AL] [TC] (3P)

### 22. Tab switching
- What: Ways to move between tabs:
  - jump to tab N by position
  - move up and down in sidebar order
  - a most-recently-used switcher overlay
- Trigger:
  - Cmd+1 to Cmd+9 jump by position. Cmd+9 can mean "last tab" (a setting).
  - Cmd+Opt+Up/Down moves in sidebar order.
  - Ctrl+Tab and Ctrl+Shift+Tab (or Ctrl+`) step through the recent switcher. Hold Ctrl and press W to close tabs from inside it.
- Defaults: The switcher shows the last 5 tabs, tinted with the Space theme, and no longer dims the page.
- Edge cases: Switching Space returns you to the last tab you used in that Space ([RN23]).
- Sources: [KS] [SWITCH] [RN22] [RN23]

### 23. Multi-select and bulk actions
- What: Act on several tabs at once.
- Trigger: Cmd-click to add tabs, Shift-click for a range.
- Defaults: Bulk actions are Cmd+W (close all), Cmd+Shift+C (copy every URL), New Folder, Share Items, Open in Split View, and Move.
- Edge cases: None found.
- Sources: [RN22] [SH] [TB1] (3P)

### 24. Tab context actions
- What: Right-click a tab to:
  - Rename it (also by double-clicking)
  - Change Icon (emoji)
  - Duplicate (keeps history)
  - Mute (works on any tab)
  - Copy URL / Copy as Markdown
  - Move to [Space/Folder/Favorites]
  - Archive tabs below
  - Add Split View
  - Share
- Trigger: Right-click, or double-click the title to rename.
- Defaults: The custom title is kept.
- Edge cases:
  - Other ways to duplicate: Option-drag a tab ([RN22]), or Cmd-click the reload button ([RN23]).
  - Moving a tab to another Space no longer opens the rename field.
- Sources: [RN22] [RN23] [RN24]

### 25. Drag and drop into the sidebar
- What:
  - Dropping text creates a search tab.
  - Dropping Finder files or folders adds them as items; folders expand inline ([RN21]).
  - Dropping a page link creates a tab.
  - Dragging a tab left or right moves it to another Space.
- Trigger: Drag onto the sidebar.
- Defaults: Light haptic feedback while dragging tabs (Force Touch trackpads).
- Edge cases: A tab dragged out is less likely to create a new window by accident ([RN23]).
- Sources: [RN21] [RN22] [RN23]

### 26. Background tab suspension and Battery Saver
- What:
  - Idle background tabs are suspended.
  - Background tabs using a lot of CPU are frozen automatically.
  - Battery Saver mode switches on below 20% battery, with a notice, and off again above 20%.
- Trigger: Automatic.
- Defaults: On.
- Edge cases: Tabs playing media, or using the mic, camera or screen recording, are never suspended.
- Sources: [RN21] [RN22] [RN23] [RN24]

---

## C. Spaces and Profiles

### 27. Spaces
- What: Separate sidebars inside one window. Each has its own pinned tabs, Today tabs, theme, icon and name. Favorites are shared per Profile.
- Trigger:
  - Create: "+" > New Space, or "New Space" in the Command Bar. A new Space is inserted next to the active one.
  - Switch:
    - click its icon at the bottom of the sidebar
    - two-finger horizontal swipe on the sidebar
    - Cmd+Opt+Left/Right
    - Ctrl+1 to Ctrl+9
  - Rename by clicking the title, or Spaces > Rename Space in the menu bar.
  - Reorder by dragging the Space icons.
  - Move a tab: drag it sideways, right-click > Move to, or "Move to [Space]" in the Command Bar.
- Defaults: Returns to the last-used tab in the Space. The swipe animates the Space icon too.
- Edge cases:
  - Deleting a Space asks for confirmation (naming the Space) and also deletes its Air Traffic Control routes.
  - "Manage Spaces" in the Command Bar opens a manager.
  - Library > Spaces lets you drag tabs between Spaces, including empty ones.
- Sources: [SP] [CTO] [RN22] [RN23] [WIN-RN]

### 28. Space themes
- What: A colour theme per Space. It tints the window frame, sidebar, Command Bar, menus, toasts, previews and the Ctrl+Tab switcher.
- Trigger:
  - Hover the Space name > edit (paintbrush) > Theme.
  - Or right-click empty sidebar > Theme, or "Theme" in the Command Bar.
- Defaults:
  - The picker has presets, up to 3 colours blended as a gradient, an Intensity slider and a Grain slider.
  - The Light/Dark/Auto mode applies to all Spaces.
  - Deselecting every colour (−) restores the default theme.
- Edge cases:
  - Haptic ticks in the picker.
  - Easels and Notes follow the Space theme.
  - Gradient themes sync to Windows.
- Sources: [SP] [THEME] [MODE] [RN22] [RN23] [WIN-RN] [SWEET] (3P)

### 29. Space and tab emoji icons
- What: An emoji as the icon of a Space or a tab.
- Trigger: Right-click > Change Space icon / Change Icon. The picker has search and skin tones.
- Defaults: Spaces show a default dot/glyph until you set one.
- Edge cases: Icons sync to Windows.
- Sources: [SP] [RN21] [RN24] [WIN-RN]

### 30. Profiles
- What: Separate browser data attached to one or more Spaces:
  - logins, passwords and autofill
  - history, cookies and cache
  - extensions
  - Favorites
  - archive timing
  - search engine, download folder and notes app
  - default-browser choice
- Trigger:
  - Space title > "…" > Profile > pick one, or New Profile.
  - The Profile can also be chosen in the new-Space flow.
- Defaults: A "Default" Profile. A new Profile starts empty.
- Edge cases:
  - Switching Space switches Profile; there is no separate profile switcher.
  - Profiles do not sync, but their Spaces do.
  - Little Arc remembers which Profile you picked for each domain.
- Sources: [PR] [SP] [CLR] [RN22] [RN23]

---

## D. Multitasking

### 31. Peek
- What: A floating overlay that shows a page without adding a sidebar tab.
- Trigger:
  - Clicking a link in a pinned tab or Favorite that goes to another domain, or that would open a new tab.
  - Shift-clicking any link.
  - Links to Easels and Notes, and items opened from the Library.
- Defaults:
  - Shift-click opens Peek; the toggle is in Settings > Links.
  - Meeting links open in a normal tab instead.
- Edge cases:
  - Overlay buttons: expand to a full tab (also Cmd+O), open as Split View, and close.
  - Closing: Esc, clicking outside, Cmd+W, or an interactive dismiss gesture.
  - Cmd+Z or Cmd+Shift+T reopens a closed Peek.
  - Peek follows Air Traffic Control routes.
  - The toolbar can show inside Peek.
- Sources: [PT] [FAV] [RN23] [RN24] [VIV] [ORP] (3P)

### 32. Split View
- What: Up to 4 panes in one tab, side by side or stacked. The sidebar shows the split as one item, which can be pinned, favourited, renamed or moved.
- Trigger:
  - Drag a sidebar tab onto the page (centre, or the top/bottom centre for stacked), or onto another sidebar tab. Which side you drop on sets the pane order.
  - Ctrl+Shift+= adds a split.
  - Command Bar actions: "Add Right/Left/Top/Bottom Split".
  - Option-click a tab or link.
  - Option-click the current tab to split it with a copy of itself.
- Defaults:
  - Ctrl+Shift+1 to 4 focuses a pane; Ctrl+Shift+] and [ step through panes (3P).
  - Ctrl+Shift+- closes the active pane.
  - Cmd+L acts on the focused pane.
- Edge cases:
  - Separate with right-click > Separate All Tabs, Option-click the split item, or the X over a pane.
  - The Split Controls menu flips the orientation.
  - Right-click to Mute one pane or Duplicate the split.
  - The divider is drag-resizable.
  - A split made from a pinned tab stays pinned.
  - The help article gave Cmd+Shift+= in one version; Ctrl+Shift+= is the current table.
- Sources: [SV] [KS] [RN21] [RN22] [RN23] [RN24] [HK] (3P)

### 33. Little Arc
- What: A small, sidebar-less floating window for quick lookups and links from other apps. It has no tab list.
- Trigger:
  - Cmd+Opt+N opens one from anywhere, including when Arc is in the background.
  - Clicking a link in another app opens it here by default.
  - Cmd+Opt+click a link or tab.
- Defaults:
  - The "Open In" button at the top, or Cmd+O, moves the page to the most recent Space.
  - Cmd+Opt+O picks a Space. Cmd+Shift+O plus the arrow keys triages to a Space.
  - Auto-archives after 6 hours.
- Edge cases:
  - Several Little Arc windows can be open at once.
  - Clicking the same external link again brings back the existing window.
  - Always appears above full screen and in the current macOS Space.
  - Remembers the Profile per domain.
  - Extensions work inside it.
  - Closed pages go to the Archive under a Little Arc filter.
  - The Dock menu offers Show/Hide All Little Arc Windows.
  - An optional menu-bar button (2021).
- Sources: [LA] [KS] [RN21] [RN22] [RN23] [RN24] [ALAOFF] [GIGA] (3P)

### 34. Air Traffic Control
- What: Routing rules for links opened from other apps.
- Trigger: Settings > Links > Air Traffic Control, or "Open Link Preferences" in the Command Bar.
- Defaults:
  - The default destination is Little Arc. The alternatives are a chosen Space or "Most Recent Space".
  - Each rule is URL "contains" text or URL "is equal to" a URL, sent to a Space or to Little Arc.
- Edge cases:
  - Unticking the Little Arc option sends external links to the default Space.
  - Rules also apply to Peek and to restored archive tabs.
  - Deleting a Space deletes its rules.
  - Rules do not sync.
  - Matching by source app is unverified.
- Sources: [ATC] [RN24] [ATH-ATC] (3P)

---

## E. Media

### 35. Mini Player (auto Picture in Picture)
- What: Switching away from a tab that is playing video pops the video into a floating player.
- Trigger: Automatic on tab switch. Manually: right-click the video twice > Picture in Picture.
- Defaults:
  - On.
  - Muted tabs do not trigger it.
  - Turn it off per site in Site Control Center, or globally in Settings > Advanced.
- Edge cases:
  - Resize by dragging a corner, pinching, or Cmd+scroll. Move it by flicking it to a corner or with a two-finger scroll.
  - Double-click returns to the tab.
  - The keyboard play/pause key controls it. With the player focused, the arrow keys seek and Space plays/pauses.
  - Closing the video keeps the audio going in the sidebar player.
  - It can be dismissed per site for the day or for good.
- Sources: [MP] [MPOFF] [RN21] [RN22] [RN23]

### 36. Sidebar audio player, media tray and mute
- What: Switching away from a tab that is playing audio shows a mini player at the bottom of the sidebar: play/pause, skip, a scrolling title, and a "back to PiP" button. With several media tabs it becomes a tray of players.
- Trigger: Automatic. Right-click any tab > Mute.
- Defaults: On.
- Edge cases:
  - Spotify gets previous/next buttons.
  - The player still shows at very low volume.
- Sources: [MP] [RN21] [RN22] [RN23] [RN24]

### 37. Video-call extras
- What:
  - Leaving a Google Meet tab gives a Meet Picture in Picture with controls and chat.
  - A "Share This Tab Instead" button appears on sidebar tabs during screen sharing.
  - A tab being shared shows an indicator.
- Trigger: Automatic during a call.
- Defaults: On. Turn off in Site Settings.
- Edge cases: Pinch to resize, two-finger drag to move.
- Sources: [RN23] [RN24]

### 38. Live Calendar
- What: With Google Calendar as a Favorite, the sidebar shows a countdown to the next meeting and a Join button when it starts.
- Trigger: Automatic. Ctrl+Cmd+J joins the active meeting.
- Defaults: Declined events are ignored. Right-click the calendar icon for notification settings.
- Edge cases: Meetings you have not RSVP'd to are never auto-joined ([RN22]).
- Sources: [CAL] [GCAL] [RN22] [RN24]

---

## F. Capture, content and sharing

### 39. Capture tool
- What: Screenshot a region or a single page element.
- Trigger: Cmd+Shift+2, "Capture" in the Command Bar, or the camera icon in Site Control Center.
- Defaults:
  - Drag a rectangle, or hover to highlight an element and click it.
  - The menu afterwards offers Copy, Save, Share (iMessage), Retake, Edit/markup, Add to Easel, and a "Save to Library" toggle.
- Edge cases:
  - Element captures are padded and centred ([DREW], 3P).
  - Captures in Little Arc, Incognito or Blank windows can still go to an Easel.
- Sources: [EASEL] [RN22] [RN24] [ASHOT] (3P)

### 40. Full-page and Portrait captures
- What:
  - Full Page saves the whole scrolling page as a PNG in Downloads.
  - Portrait Mode makes a framed shot on white, a colour, or your wallpaper, and copies it to the clipboard.
- Trigger:
  - Full page: "Capture Full Page" in the Command Bar, or File > Capture Full Page. No default shortcut; you can assign one.
  - Portrait: "Capture in Portrait Mode" in the Command Bar, Option-click the full-page button, or the Developer Mode toolbar.
- Defaults: No shortcut is bound.
- Edge cases: Option-click on the Portrait button captures with the default settings.
- Sources: [FPC] [RN22] [RN23] [RN24] [APORT] (3P)

### 41. Easels
- What: A freeform canvas for text, drawing, shapes, images, links, captures and video embeds.
  - "Live" captures stay interactive; Cmd+R refreshes them.
  - Alignment guides help placement.
- Trigger: Ctrl+Shift+E, "+" > New Easel, or the Command Bar.
- Defaults:
  - Opens as a pinned tab.
  - Follows the Space theme.
  - Spell check is on.
- Edge cases:
  - Shared by link: anyone can view it in a browser, but only the Mac app can edit it.
  - PNG export (follows dark mode).
  - Pinch or Cmd+Plus/Minus to zoom.
  - Cmd+Up/Down jumps to the top or bottom.
- Sources: [EASEL] [KS] [RN21] [RN22] [RN23] [RN24]

### 42. Notes and "New Document"
- What: Native Arc Notes were removed between Mar 14 and Apr 18, 2024; old notes export as HTML. The replacement opens a new document in your chosen notes app.
- Trigger: Ctrl+Shift+N, "New Note" / "New Note Split" in the Command Bar, or "+".
- Defaults: Settings > General > New Documents chooses Notion, Google Docs, Word or Confluence.
- Edge cases: None. Build only the "New Document" launcher.
- Sources: [NOTESOUT] [NOTESAPP] [RN23] [RN24]

### 43. Library
- What: One place for:
  - Media (images, videos, captures)
  - Downloads
  - Easels & Notes
  - Spaces (all tabs, drag between Spaces)
  - Archived Tabs
  - Boosts (formerly)
- Trigger: The Library icon at the bottom left of the sidebar, or "Open Library" in the Command Bar. A Cmd+Shift+L shortcut is unverified.
- Defaults:
  - Opens to the section used last.
  - Hovering the icon shows recent downloads.
  - Right-click the icon to toggle whether screenshots are included.
- Edge cases:
  - Deleting an item moves it to the Trash.
  - Files can be dragged out even when Arc is in the background.
  - Video previews autoplay.
- Sources: [LIB] [RN22] [RN23] [RN24]

### 44. Downloads
- What: Downloads go to the Library instead of opening as tabs. The bottom of the sidebar shows progress, size, time left and a cancel button.
- Trigger: Automatic. Cmd+Shift+J opens Downloads (3P), or "Downloads" in the Command Bar.
- Defaults:
  - The download folder is set per Profile.
  - Files are checked by macOS Gatekeeper.
- Edge cases:
  - Downloads auto-archive like tabs.
  - Several download animations can run at once.
- Sources: [LIB] [CMD] [PR] [RN22] [RN23] [HK] (3P)

### 45. Copy URL and toasts
- What: Copies the clean URL with trackers removed (for example on Amazon and Instagram), then shows a toast.
- Trigger:
  - Cmd+Shift+C copies the URL.
  - Cmd+Shift+Opt+C copies it as Markdown.
  - Both are also in the right-click menus and the copy button in the URL row.
- Defaults:
  - Both shortcuts can be remapped.
  - With multi-selected tabs, every URL is copied.
- Edge cases:
  - Toasts use the theme colours and appear over the right Split View pane.
  - Users describe the toast as prominent, with a Share button ([ORT], 3P).
- Sources: [KS] [RN21] [RN22] [RN24] [ORT] (3P)

### 46. Share page and Share Quote
- What:
  - "Share" (Command Bar or toolbar right-click) opens the macOS share sheet.
  - A "Share Quote" button in the URL bar shares selected text.
- Trigger: Command Bar, right-click, or the button in the URL bar.
- Defaults: Share Quote is on, but auto-disabled on Gmail, Slack, Notion, YouTube and Confluence. A switch in Settings > Advanced turns it off.
- Edge cases: The exact Share Quote output is unverified.
- Sources: [RN23] [RN24]

### 47. Share Spaces, folders and splits by link
- What: A read-only snapshot link. Arc users can add it to their sidebar; anyone else sees a web page laid out like Arc.
- Trigger:
  - Hover the Space title > Share.
  - Right-click a folder or split > Share.
  - Shift-select items > Share Items.
- Defaults: A snapshot only; later changes do not appear.
- Edge cases:
  - Links cannot be revoked by the user.
  - A received shared folder lands at the bottom of the pinned section.
- Sources: [SH] [RN23]

---

## G. Customisation and power features

### 48. Boosts
- What: Per-site customisation:
  - colours (hue wheel, invert, contrast/brightness/saturation)
  - font, size (90–150%) and text case
  - Zap: click elements to hide them
  - custom CSS/JS, with an eyedropper that copies selectors
- Trigger: The Site Control Center paintbrush, "Create Boost" in the Command Bar, or "+".
- Defaults:
  - Toggle per site with the paintbrush (greyed out means off).
  - JavaScript Boosts have been off by default since Sep 2024; turn them back on per device under "View Boosts".
  - A global off switch is in Settings > Advanced.
- Edge cases:
  - The gallery, sharing and "Shuffle" are deprecated.
  - Boosts can read the Space theme colour.
- Sources: [BOOST] [RN22] [RN23] [RN24] [ABOOST] (3P)

### 49. Developer Mode
- What: A mode for local development:
  - a full URL bar (protocol, host, port, path) across the top
  - a yellow/black outline on the dev tab
  - a toolbar with DevTools, console, network, inspector and Portrait capture
  - the JSON Formatter extension installed automatically
- Trigger:
  - Automatic on localhost and its subdomains.
  - Manually: Ctrl+D, Site Control Center > Developer Mode, or "Turn on Developer Mode for this site" in the Command Bar.
- Defaults: On for localhost only.
- Edge cases:
  - F12 and Cmd+Opt+I open DevTools.
  - Docked DevTools keep their size across tabs.
  - A built-in log viewer and auto-reload are unverified.
- Sources: [DEV] [RN22] [RN23] [RN24] [DREW] (3P)

### 50. Extensions
- What: Chrome Web Store extensions, managed through Site Control Center. Pinned extensions sit in the URL row, or at the top right when the toolbar is shown.
- Trigger: Install from the Chrome Web Store. Activate from the Site Control Center or the Command Bar.
- Defaults: Extensions are per Profile.
- Edge cases:
  - Extensions work in Little Arc.
  - Right-click > Remove from Arc.
  - Cmd+E to cycle extensions is unverified.
- Sources: [EXT] [EXT2] [RN21] [RN22]

### 51. Custom keyboard shortcuts
- What: Every Arc shortcut can be rebound.
- Trigger: Settings > Shortcuts, or "Open Shortcuts" in the Command Bar. Click a shortcut, then press the new keys.
- Defaults: The table in #78.
- Edge cases:
  - Conflicts are marked with a red "!".
  - Right-click > Reset Shortcut to Default.
  - Function keys can be remapped.
  - Web-page shortcuts take priority; pressing the same keys again runs Arc's action ([RN21]).
  - Custom shortcuts do not sync.
- Sources: [SC] [RN21] [RN22] [RN23] [SYNC]

### 52. Settings panes
- What: The Settings panes are:
  - General: Previews, New Documents app, Little Arc timer
  - Profiles: archive time, search engine, downloads, notes app
  - Shortcuts
  - Links: Little Arc, Peek, Air Traffic Control
  - Icon
  - Max
  - Advanced: full URL, sounds, haptics, PiP, Boosts off, Share Quote, Chromium settings
  - Account: sync, name, delete account
- Trigger: Cmd+, or the Arc menu > Settings.
- Defaults: Redesigned in Apr 2024.
- Edge cases: Every pane is reachable from the Command Bar.
- Sources: [RN22] [RN23] [RN24] [ATC] [URL]

### 53. App icons
- What: Alternative Dock icons.
- Trigger: Settings > Icon.
- Defaults: All icons available since Nov 2024.
- Edge cases: The quit dialog shows the chosen icon. Radian needs its own art.
- Sources: [ICON] [RN24]

### 54. Haptics and sounds
- What:
  - Light haptic feedback when dragging tabs and in the theme picker.
  - Arc plays some UI sounds; the events are undocumented.
- Trigger: Automatic.
- Defaults: On. Each can be turned off in Settings > Advanced.
- Edge cases: None found.
- Sources: [RN22] [RN23]

### 55. AppleScript API
- What: A scripting dictionary to query Spaces and tabs and to create tabs and windows. Tools like Raycast rely on it.
- Trigger: osascript and similar.
- Defaults: Always on.
- Edge cases: None found.
- Sources: [RN23]

### 56. Theme colours exposed to web pages
- What: Arc injects CSS custom properties into every page, describing the current Space palette (`--arc-palette-*` and `--arc-background-gradient-*`).
- Trigger: Automatic.
- Defaults: Set late in page load. `color1` is absent for single-colour themes.
- Edge cases: Some sites and extensions read these properties.
- Sources: [UAT] (3P)

---

## H. Arc Max (AI)

All of these are turned on in Settings > Max, together or one by one ([MAX]).

### 57. Tidy Tabs
- What: Groups Today tabs into AI-named sections.
- Trigger: A broom icon on the divider (shown on hover) once Today has more than 6 tabs.
- Defaults: Off until Max is enabled. Pinned tabs are never touched.
- Edge cases:
  - A group can become a pinned folder, or be closed.
  - Right-click > Remove header ungroups it.
  - New tabs stay ungrouped until the next tidy.
- Sources: [MAX] [RN24] [AT] (3P)

### 58. Tidy Tab Titles
- What: Shortens tab titles when a tab is pinned.
- Trigger: Automatic on pin.
- Defaults: Off until enabled.
- Edge cases: None found.
- Sources: [MAX] [RN24]

### 59. Tidy Downloads
- What: Renames downloaded files to readable names.
- Trigger: Automatic.
- Defaults: Off until enabled.
- Edge cases: Can be undone with one click (3P).
- Sources: [MAX] [RN24]

### 60. 5-second Previews
- What: An AI summary card for a link.
- Trigger: Hold Shift and hover a link. On Google, DuckDuckGo and Bing results, X, Threads and HN, hovering alone works.
- Defaults: Off until enabled.
- Edge cases: The preview image keeps the Open Graph aspect ratio.
- Sources: [MAX] [RN23] [RN24]

### 61. Instant Links
- What: Skips the results page and opens the top result directly.
- Trigger: Shift+Enter in the Command Bar.
- Defaults: Off until enabled.
- Edge cases: The Shift+Enter hint icons were removed in Jun 2024, but the shortcut still works.
- Sources: [MAX] [RN24]

### 62. ChatGPT shortcut
- What: Asks ChatGPT straight from Arc.
- Trigger: Cmd+Opt+G, typing "gpt" then Tab, or the ChatGPT suggestion in the Command Bar.
- Defaults: Requires a ChatGPT login in that Profile.
- Edge cases: Ask on Page (Max in Cmd+F) was removed Aug 28, 2025. Do not build it.
- Sources: [MAX] [RN23] [RN24]

### 63. Hover Previews for pinned apps
- What: Hovering a pinned tab or Favorite shows a live card:
  - Gmail/Outlook: recent mail and a new-draft button
  - Calendar: today's meetings
  - Notion: recent pages
  - also GitHub, Figma, Linear and Confluence
- Trigger: Hover.
- Defaults: Toggled per app in Settings > General > Previews.
- Edge cases: macOS only.
- Sources: [PREV] [GCAL] [RN24]

---

## I. Standard browser, account and system

### 64. Find in page
- What: Search for text on the page.
- Trigger: Cmd+F. Cmd+G / Cmd+Shift+G (or F3 / Shift+F3) for next and previous.
- Defaults: Plain find.
- Edge cases: None found.
- Sources: [KS] [HK] (3P)

### 65. Zoom
- What: Page zoom.
- Trigger: Cmd+= / Cmd+- / Cmd+0.
- Defaults: A zoom-percentage indicator appears.
- Edge cases: Cmd+0 also resets trackpad pinch zoom.
- Sources: [KS] [RN23]

### 66. Navigation
- What: Standard page navigation:
  - Back/forward: Cmd+[ / Cmd+], Cmd+Left / Cmd+Right, or a two-finger swipe on the page (Chromium-style arrow, [ORS] 3P).
  - Reload: Cmd+R. Hard reload: Cmd+Shift+R. Stop: Cmd+.
  - History: Cmd+Y.
- Trigger: As above.
- Defaults: Standard.
- Edge cases:
  - Long-press back for tab history.
  - A crashed tab shows a "Sad Tab" page.
- Sources: [KS] [RN21] [RN23] [HK] (3P)

### 67. Default browser and link handling
- What: Arc can be the system browser. External links then follow Air Traffic Control (#34).
- Trigger: Arc menu > Set as Default Browser.
- Defaults: Not stated.
- Edge cases: The setting may be per Profile.
- Sources: [DEF] [PR]

### 68. Import from another browser
- What: Imports bookmarks, logins and history at onboarding. Arc then suggests Favorites and pinned tabs from the imported history.
- Trigger: Onboarding, or Arc > Import from Another Browser.
- Defaults: Part of onboarding.
- Edge cases: Radian's key importer is "from Arc" (see PLAN.md). The data-export article lists what Arc can export.
- Sources: [RN22] [RN23] [EXP]

### 69. Session restore
- What: Windows, Spaces and tabs come back after a quit or restart.
- Trigger: Automatic.
- Defaults: On for everyone since May 2024.
- Edge cases: Updates install while the Mac is idle and wait while media is playing.
- Sources: [RN24]

### 70. Passwords and autofill
- What: The Chromium password manager and address autofill, plus iCloud Keychain passkeys (Nov 2025).
- Trigger: "Manage Passwords" in the Command Bar, or the autofill prompts.
- Defaults: Per Profile.
- Edge cases: None found.
- Sources: [RN23] [RN24] [PR]

### 71. Clear browsing data
- What: Clears cache, cookies and history for a Profile, or cookies for one site.
- Trigger: Per Profile in Settings. Per site: URL row > Site Control Center > clear.
- Defaults: Per Profile.
- Edge cases: None found.
- Sources: [CLR] [RN23]

### 72. Sync
- What: Account-based, end-to-end encrypted sync (with a recovery card). It covers Spaces, pinned tabs, folders, Today tabs, Space order and archive timing.
- Trigger: Settings > Account > Turn On.
- Defaults: Off until turned on.
- Edge cases:
  - Does not sync history, passwords, extensions, Favorites, Profiles, shortcuts or Air Traffic Control.
  - A green dot shows when sync is on; hover it for the last sync time.
  - Arc's own sync ends with the sunset, so Radian needs its own.
- Sources: [SYNC] [RN23] [RN24]

### 73. Auto-update and update banner
- What: Updates install while the Mac is idle. A collapsed banner at the bottom of the sidebar expands on hover and links to what's new.
- Trigger: Automatic.
- Defaults: On. Updates wait while media plays.
- Edge cases: None found.
- Sources: [RN22] [RN24]

### 74. Notifications
- What: Web notifications. Clicking one opens the tab that sent it.
- Trigger: Click the notification.
- Defaults: Standard.
- Edge cases: None found.
- Sources: [RN23]

### 75. Dock menu
- What: Right-click the Dock icon for New Window, New Incognito Window, and Show/Hide All Little Arc Windows.
- Trigger: Right-click the Dock icon.
- Defaults: Always available.
- Edge cases: None found.
- Sources: [RN22] [RN23]

### 76. Help menu
- What: Help > Essential Keyboard Shortcuts. The Command Bar also has "What's New", "Getting Started" and "Help".
- Trigger: Menu or Command Bar.
- Defaults: Always available.
- Edge cases: None found.
- Sources: [RN23]

### 77. Cast
- What: Casts the current tab to a Chromecast device.
- Trigger: View > Cast.
- Defaults: Always available.
- Edge cases: None found.
- Sources: [RN21] [RN23]

### 78. Default keyboard shortcuts (macOS)
- What: The defaults Radian should ship. They match the official table except where marked "(3P)" or "(unverified)".
- Trigger: As listed.
- Defaults: As listed.
- Edge cases: None.
- Sources: [KS] [DK] [SWITCH] [LA] [RN22] [RN23] [RN24] [HK] (3P)

| Action | Shortcut |
|---|---|
| Command Bar / new tab | Cmd+T |
| Edit URL | Cmd+L |
| New window / blank window | Cmd+N / Ctrl+Cmd+N |
| Incognito window | Cmd+Shift+N |
| Little Arc | Cmd+Opt+N |
| Little Arc: send to recent Space / pick Space / triage | Cmd+O / Cmd+Opt+O / Cmd+Shift+O |
| Close tab | Cmd+W |
| Reopen closed tab or Peek | Cmd+Shift+T (also Cmd+Z) |
| Copy URL / as Markdown | Cmd+Shift+C / Cmd+Shift+Opt+C |
| Toggle sidebar | Cmd+S |
| Toggle top toolbar | Cmd+Shift+D |
| Clear Today | Cmd+Shift+K |
| Pin / unpin | Cmd+D |
| Go to tab 1–9 | Cmd+1…9 |
| Recent-tab switcher | Ctrl+Tab / Ctrl+Shift+Tab |
| Previous / next tab | Cmd+Opt+Up / Down |
| Previous / next Space | Cmd+Opt+Left / Right |
| Go to Space N | Ctrl+1…9 |
| Back / forward | Cmd+[ / Cmd+] (also Cmd+Left / Right) |
| Add split / close split | Ctrl+Shift+= / Ctrl+Shift+- |
| Focus split pane N | Ctrl+Shift+1…4 |
| Next / previous pane | Ctrl+Shift+] / [ (3P) |
| Find / next / previous | Cmd+F / Cmd+G / Cmd+Shift+G |
| Capture | Cmd+Shift+2 |
| Developer Mode | Ctrl+D |
| DevTools | Cmd+Opt+I (also F12) |
| New Easel | Ctrl+Shift+E |
| New Note (document) | Ctrl+Shift+N |
| ChatGPT | Cmd+Opt+G |
| Join meeting | Ctrl+Cmd+J |
| Paste URL as new tab | Cmd+Opt+V |
| History | Cmd+Y |
| Downloads | Cmd+Shift+J (3P) |
| Library | Cmd+Shift+L (unverified) |
| Settings | Cmd+, |
| Zoom in / out / reset | Cmd+= / Cmd+- / Cmd+0 |
| Reload / hard reload / stop | Cmd+R / Cmd+Shift+R / Cmd+. |
| Full screen | Ctrl+Cmd+F |
| Delete Command Bar suggestion | Cmd+Opt+Delete |
| Instant Links | Shift+Enter (in the Command Bar) |

---

## Removed from Arc (do not build unless wanted)

- Arc Notes: Apr 2024.
- Reader Mode: Jun 2024.
- Ask on Page: Aug 2025.
- Paste and Go: Mar 2024.
- Recent Tab indicator: Feb 2024.
- GitHub Previews: May 2024, replaced by Live Folders.
- Boost Gallery, sharing and the legacy Boost builder: 2024.
- iCloud sync: Jun 2024.

Sources: [RN24] [NOTESOUT].

---

## Checklist

| # | Feature | Priority | Source |
|---|---|---|---|
| 1 | Sidebar anatomy, no toolbar | P0 | [SP] [FAV] [RN23] |
| 2 | Hide/show sidebar, hover reveal | P0 | [HIDE] [KS] [RN24] |
| 3 | Sidebar resize | P1 | [RN21] [RN22] |
| 4 | URL row, optional toolbar | P0 | [URL] [EXT] [RN23] |
| 5 | Site Control Center | P1 | [MPOFF] [DEV] [FPC] |
| 6 | Command Bar | P0 | [KS] [CMD] [RN23] |
| 7 | Site Search keywords | P1 | [SS] |
| 8 | Window model and Tab Handoff | P0 | [WINS] [RN23] |
| 9 | Incognito | P0 | [INC] [RN21] |
| 10 | Window drag regions, focus dimming | P1 | [RN22] [RN23] |
| 11 | Full-screen behaviour | P1 | [RN23] |
| 12 | Today section, new-tab placement | P0 | [MAX] [TW] |
| 13 | Close to archive, reopen | P0 | [KS] [RN23] |
| 14 | Clear Today, Archive Below | P0 | [KS] [RN22] |
| 15 | Auto-archive | P0 | [ARCH] [PR] |
| 16 | Archive view and restore | P1 | [ARCH] [LIB] |
| 17 | Pinned tabs | P0 | [PT] [SL] [REV] |
| 18 | Collapse pinned section | P1 | [PT] [RN24] |
| 19 | Favorites | P0 | [FAV] [RN23] |
| 20 | Folders | P0 | [FO] [RN23] |
| 21 | Live Folders (GitHub) | P2 | [LF] |
| 22 | Tab switching, Ctrl+Tab switcher | P0 | [KS] [SWITCH] |
| 23 | Multi-select, bulk actions | P1 | [RN22] |
| 24 | Tab context actions | P1 | [RN22] [RN23] |
| 25 | Drag and drop into sidebar | P2 | [RN21] [RN23] |
| 26 | Tab suspension, Battery Saver | P1 | [RN23] [RN24] |
| 27 | Spaces | P0 | [SP] |
| 28 | Space themes | P0 | [SP] [RN22] |
| 29 | Space/tab emoji icons | P1 | [SP] [RN24] |
| 30 | Profiles | P0 | [PR] |
| 31 | Peek | P0 | [PT] [RN23] |
| 32 | Split View | P1 | [SV] [KS] |
| 33 | Little Arc | P0 | [LA] |
| 34 | Air Traffic Control | P1 | [ATC] |
| 35 | Mini Player (auto PiP) | P1 | [MP] |
| 36 | Sidebar audio player, mute | P1 | [MP] [RN21] |
| 37 | Video-call extras | P2 | [RN23] [RN24] |
| 38 | Live Calendar | P2 | [CAL] |
| 39 | Capture tool | P1 | [EASEL] [RN22] |
| 40 | Full-page / Portrait capture | P2 | [FPC] |
| 41 | Easels | P2 | [EASEL] |
| 42 | New Document (Notes successor) | P2 | [NOTESAPP] |
| 43 | Library | P1 | [LIB] |
| 44 | Downloads | P0 | [LIB] [RN23] |
| 45 | Copy URL (clean) and toasts | P0 | [KS] [RN21] |
| 46 | Share page, Share Quote | P2 | [RN24] |
| 47 | Share Spaces/folders/splits | P2 | [SH] |
| 48 | Boosts | P2 | [BOOST] |
| 49 | Developer Mode | P2 | [DEV] |
| 50 | Extensions | P0 | [EXT2] |
| 51 | Custom keyboard shortcuts | P1 | [SC] |
| 52 | Settings panes | P1 | [RN24] |
| 53 | App icons | P2 | [ICON] |
| 54 | Haptics and sounds | P2 | [RN22] [RN23] |
| 55 | AppleScript API | P2 | [RN23] |
| 56 | Theme CSS variables for pages | P2 | [UAT] |
| 57 | Tidy Tabs | P2 | [MAX] |
| 58 | Tidy Tab Titles | P2 | [MAX] |
| 59 | Tidy Downloads | P2 | [MAX] |
| 60 | 5-second Previews | P2 | [MAX] |
| 61 | Instant Links | P2 | [MAX] [RN24] |
| 62 | ChatGPT shortcut | P2 | [MAX] |
| 63 | Hover Previews for pinned apps | P2 | [PREV] |
| 64 | Find in page | P0 | [KS] |
| 65 | Zoom | P0 | [KS] |
| 66 | Navigation | P0 | [KS] |
| 67 | Default browser, link handling | P0 | [DEF] |
| 68 | Import from another browser | P0 | [RN22] |
| 69 | Session restore | P0 | [RN24] |
| 70 | Passwords and autofill | P0 | [RN23] |
| 71 | Clear browsing data | P1 | [CLR] |
| 72 | Sync | P1 | [SYNC] |
| 73 | Auto-update, update banner | P1 | [RN24] |
| 74 | Notifications open their tab | P1 | [RN23] |
| 75 | Dock menu | P2 | [RN23] |
| 76 | Help menu shortcuts sheet | P2 | [RN23] |
| 77 | Cast | P2 | [RN23] |
| 78 | Default keyboard shortcut set | P0 | [KS] [DK] |

Totals: 78 features. 30 are P0, 23 are P1 and 25 are P2.

---

## Sources

Official Arc help center. Most pages return 403 to scripts and were read through search summaries. The release notes (RN) were read in full through the API.

[KS]: https://resources.arc.net/hc/en-us/articles/20595231349911-Keyboard-Shortcuts
[SP]: https://resources.arc.net/hc/en-us/articles/19228064149143-Spaces-Distinct-Browsing-Areas
[PR]: https://resources.arc.net/hc/en-us/articles/19227964556183-Profiles-Separate-Work-Personal-Browsing
[PT]: https://resources.arc.net/hc/en-us/articles/19231060187159-Pinned-Tabs-Tabs-you-want-to-stick-around
[REV]: https://resources.arc.net/hc/en-us/articles/25541939922199-Why-Are-My-Pinned-Tabs-and-Favorites-Reverting-Back-to-Their-Original-URL-in-Arc-for-Desktop
[SL]: https://resources.arc.net/hc/en-us/articles/25625148480279-Why-is-There-a-Slash-Next-to-My-Pinned-Tab-s-Name
[FAV]: https://resources.arc.net/hc/en-us/articles/19230755904151-Favorites-Top-Tabs-Across-Every-Space
[FO]: https://resources.arc.net/hc/en-us/articles/19228419623447-Folders-Stash-Similar-Tabs-Together
[LF]: https://resources.arc.net/hc/en-us/articles/22731612065815-Automatic-GitHub-Live-Folders
[LIB]: https://resources.arc.net/hc/en-us/articles/19230634389911-Library-A-home-for-your-downloads-archived-tabs-easels-and-more
[ARCH]: https://resources.arc.net/hc/en-us/articles/19228855311127
[ATC]: https://resources.arc.net/hc/en-us/articles/22932014625431-Air-Traffic-Control-Automate-Your-Link-Routing
[LA]: https://resources.arc.net/hc/en-us/articles/19235387524503-Little-Arc-Quick-Lookups-Instant-Triaging
[SH]: https://resources.arc.net/hc/en-us/articles/19228534606743-Share-Spaces-Folders-Splits-with-Anyone
[SYNC]: https://resources.arc.net/hc/en-us/articles/20272860828823-Arc-Sync
[HIDE]: https://resources.arc.net/hc/en-us/articles/25619487530519-How-Do-You-Hide-the-Sidebar
[EXT]: https://resources.arc.net/hc/en-us/articles/25625617866263-How-Do-You-Move-Your-Pinned-Extensions-to-the-Top-Right
[EXT2]: https://resources.arc.net/hc/en-us/articles/19434259167767-Extensions-in-Arc-How-to-Import-Add-Open
[MAX]: https://resources.arc.net/hc/en-us/articles/19335160678679-Arc-Max-Boost-Your-Browsing-with-AI
[SV]: https://resources.arc.net/hc/en-us/articles/19335393146775-Split-View-View-Multiple-Tabs-at-Once
[MP]: https://resources.arc.net/hc/en-us/articles/19234766331799-Mini-Player-Watch-or-Listen-as-you-Browse
[MPOFF]: https://resources.arc.net/hc/en-us/articles/25590734716823-How-Do-You-Disable-Mini-Player-on-Arc-for-Desktop
[FPC]: https://resources.arc.net/hc/en-us/articles/25481392111895-How-To-Take-Full-Page-Screen-Captures-in-Arc
[EASEL]: https://resources.arc.net/hc/en-us/articles/19231142050071-Easels-Capture-Create
[DEV]: https://resources.arc.net/hc/en-us/articles/20468488031511-Developer-Mode-Instant-Dev-Tools
[BOOST]: https://resources.arc.net/hc/en-us/articles/19212718608151-Boosts-Customize-Any-Website
[NOTESOUT]: https://resources.arc.net/hc/en-us/articles/19233788518039-Phasing-Out-Arc-Notes
[NOTESAPP]: https://resources.arc.net/hc/en-us/articles/22557798824855-Customize-Default-Notes-App
[PREV]: https://resources.arc.net/hc/en-us/articles/19335284431639-Previews-Glance-Top-Sites
[CAL]: https://resources.arc.net/hc/en-us/articles/24158102740631-Live-Calendars
[INC]: https://resources.arc.net/hc/en-us/articles/22354398337687-Open-Incognito-Window
[WINS]: https://resources.arc.net/hc/en-us/articles/25590417429783-Why-Are-the-Same-Tabs-Appearing-Across-Multiple-Arc-Windows
[ICON]: https://resources.arc.net/hc/en-us/articles/22352326167703-Change-Arc-for-Desktop-App-Icon
[DEF]: https://resources.arc.net/hc/en-us/articles/22352228928023-Make-Arc-my-default-browser
[SC]: https://resources.arc.net/hc/en-us/articles/25622899860631-How-to-Set-Custom-Keyboard-Shortcuts-on-Arc-for-Desktop
[SS]: https://resources.arc.net/hc/en-us/articles/20855018192791-Site-Search-Directly-Search-any-Website
[URL]: https://resources.arc.net/hc/en-us/articles/25625458052247-How-Do-You-View-the-Full-URL-at-the-Top-of-the-Page-in-Arc-for-Desktop
[SWITCH]: https://resources.arc.net/hc/en-us/articles/25619402657303-How-Do-You-Switch-Between-Tabs-Quickly-on-Arc-Desktop
[THEME]: https://resources.arc.net/hc/en-us/articles/25625261733143
[MODE]: https://resources.arc.net/hc/en-us/articles/25541642978583
[CLR]: https://resources.arc.net/hc/en-us/articles/25614376281751-How-Do-You-Clear-Your-Cache-Cookies-and-or-History-on-Arc-for-Desktop
[EXP]: https://resources.arc.net/hc/en-us/articles/25583851606039-How-Do-I-Export-My-Data-from-Arc
[SUN]: https://resources.arc.net/hc/en-us/articles/44412972248471-Arc-Sunset-Key-Dates-and-What-to-Expect
[RN21]: https://resources.arc.net/hc/en-us/articles/20498463803799
[RN22]: https://resources.arc.net/hc/en-us/articles/20498417809815-Arc-for-macOS-2022-Release-Notes
[RN23]: https://resources.arc.net/hc/en-us/articles/20498377604887-Arc-for-macOS-2023-Release-Notes
[RN24]: https://resources.arc.net/hc/en-us/articles/20498293324823-Arc-for-macOS-2024-2026-Release-Notes
[WIN-RN]: https://resources.arc.net/hc/en-us/articles/22513842649623-Arc-for-Windows-2023-2026-Release-Notes

Official Arc pages outside the help center:

[CMD]: https://start.arc.net/command-bar-actions
[CTO]: https://start.arc.net/cure-tab-overload
[GCAL]: https://arc.net/integrations/google-calendar

Third parties (3P):

[DK]: https://defkey.com/arc-browser-shortcuts
[HK]: https://www.hongkiat.com/blog/arc-browser-keyboard-shortcuts/
[TB]: https://tidbits.com/2025/07/11/do-you-use-it-revisiting-websites-with-windows-bookmarks-tabs-and-pinned-tabs/
[TB1]: https://tidbits.com/2023/07/27/innovative-web-browser-arc-reaches-1-0-release/
[TW]: https://techwiser.com/arc-browsers-tab-management-is-a-serious-headache/
[AP]: https://allthings.how/how-do-pinned-tabs-work-in-arc-browser/
[AT]: https://allthings.how/how-to-organize-today-tabs-in-arc-browser-with-tidy-tabs/
[AL]: https://allthings.how/how-do-live-folders-work-in-arc-browser/
[ATIPS]: https://allthings.how/15-arc-browser-tips-tricks-to-make-web-browsing-effortless/
[ABOOST]: https://allthings.how/how-to-use-boosts-in-arc-browser
[ASHOT]: https://allthings.how/how-to-take-a-screenshot-in-arc-browser/
[APORT]: https://allthings.how/what-is-portrait-mode-in-arc-browser-and-how-to-use-it/
[ALAOFF]: https://allthings.how/how-to-turn-off-little-arc-window-in-the-arc-browser
[ATH-ATC]: https://allthings.how/how-to-route-links-to-specific-arc-spaces-using-air-traffic-control-in-the-arc-browser/
[IW]: https://issawip.substack.com/p/arc-and-why-it-will-become-your-next
[TC]: https://techcrunch.com/2024/04/11/arc-browsers-live-folders-will-auto-update-tabs-for-you/
[JM]: https://x.com/joshm/status/1724508113208754356
[SWEET]: https://thesweetsetup.com/first-look-arc-browser/
[GIGA]: https://gigazine.net/gsc_news/en/20230727-arc-web-browser
[DREW]: https://www.drewlyton.com/story/this-is-the-best-browser-for-web-development-post/
[VIV]: https://forum.vivaldi.net/post/741842
[ORP]: https://orionfeedback.org/d/4610-open-different-domains-in-popup-similar-to-arcs-peek
[ORT]: https://orionfeedback.org/d/7732-would-love-toasts-for-actions-like-copy-url-shift-c
[ORS]: https://orionfeedback.org/d/1700-implement-chromefirefox-animation-for-page-back/21
[OR]: https://orionfeedback.org/d/684-sidebar-openclose-on-hover
[MPU]: https://talk.macpowerusers.com/t/747-exploring-the-arc-browser/37408
[UAT]: https://github.com/1weiho/use-arc-theme
