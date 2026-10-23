// Trackpad haptics for Radian (src/main/haptics.js): Electron has no haptics API.
// Reads one word per line on stdin and plays it; exits when stdin closes.
import AppKit

let performer = NSHapticFeedbackManager.defaultPerformer
while let line = readLine() {
  performer.perform(line == "level" ? .levelChange : .alignment, performanceTime: .now)
}
