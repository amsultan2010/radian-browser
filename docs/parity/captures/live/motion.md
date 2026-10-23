# Arc 1.170.0: motion timings (live capture)

Captured 2026-10-23. Method: `ffmpeg -f avfoundation -framerate 60` screen recording of the Arc window region (measured frame interval 16.7–16.9 ms, no dropped frames in the windows analysed), downscaled to 160 × 100 grey, then per-frame mean absolute difference. "Progress" = difference from the first frame ÷ total difference, a proxy for animation progress (pixel difference is not linear in position, so treat curve shapes as approximate). macOS Reduce Motion is **off** (`com.apple.Accessibility ReduceMotionEnabled = 0`). The user's window has the sidebar hidden; a static macOS permission dialog sat over part of the frame during some recordings and does not affect the timings. Colours from these videos are not reliable (see captures/colors/spec.md).

Raw data, prefix `/private/tmp/claude-501/-Users-a-m-sultan-Apps-radian-browser--claude-worktrees-radian-arc-parity-b09e4c/a2376e47-cf2b-4557-9146-fbf07108e540/scratchpad/live/motion/`: `*.mkv` (recordings) and `*.txt` (frame tables: index, time s, diff vs previous, diff vs first, diff vs last), tiles `peek-open-tiles.png`, `space1-tiles.png`, `space1sb-tiles.png`, `la-close-tiles.png`, `la-open-tiles.png`. Scripts: `../tools/rec.sh`, `../tools/motion.py`.

| Transition | Trigger | Duration (to 99 %) | Shape |
|---|---|---|---|
| **Peek open** | Shift-click a link | **≈ 230 ms** (14 frames) | ease-out, no overshoot |
| **Peek close** | Escape | **≈ 180 ms** (11 frames) | ease-out, no overshoot |
| Command Bar, centred (new tab) open | ⌘T | **1 frame (≤ 17 ms)**, faint residual < 1 % for ~70 ms (shadow) | cut |
| Command Bar, centred close | Escape | 1 frame | cut |
| Command Bar from the toolbar (dropdown under the URL field) | ⌘L with a toolbar showing | 1 frame open, 1 frame close | cut |
| Tab switch | ⌥⌘↑ (sidebar hidden) | 1 frame | cut |
| Space switch | ⌃2 / ⌃1 | content swaps in 1 frame; sidebar region: 90 % in 1 frame, then a low-level tail (≈ 5–10 % of the change) settling over ≈ 150–200 ms | cut + short settle |
| Sidebar collapse (Space 2 showed the sidebar, Space 1 hides it) | ⌃1 | ≈ 67 ms (4 frames) | |
| Little Arc command window | ⌥⌘N | 1 frame (icons fill in over the next ≈ 50 ms) | cut |
| Little Arc command window close | Escape | ≈ 200 ms: contents turn blank white in 1 frame, hold ≈ 80 ms, then the window fades out over ≈ 100 ms | system window fade |

## Peek, frame by frame

Open (frame 0 = first changed frame; values = progress):
`0.11, 0.24, 0.38, 0.51, 0.62, 0.73, 0.82, 0.88, 0.93, 0.96, 0.98, 0.99, 1.00` (one value per 16.7 ms frame).
Close: `0.11, 0.29, 0.49, 0.64, 0.75, 0.84, 0.90, 0.95, 0.97, 0.98, 1.00`.

Both start at speed and decelerate (largest step on frames 2–3), between an ease-out-quad and an ease-out-cubic; a critically damped spring of ≈ 0.25 s fits. What moves (from the tiles): the clicked link's snapshot scales up from the link's position as the 1024 × 776 Peek panel grows from that spot to its centred frame, while the page behind dims; close reverses it.

## Not measured

- Arc's sidebar slide between Spaces and sidebar tab-switch highlight motion with the sidebar **docked** (the user keeps it hidden; not toggled). With the sidebar floating (hover-revealed) the switch was still a 1–2 frame cut plus a short settle.
- Easel/Note open (no Easels/Notes exist on this profile).
