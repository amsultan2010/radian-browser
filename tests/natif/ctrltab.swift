import CoreGraphics
import Foundation
// ⌃Tab comme au clavier : Contrôle enfoncé, Tab (n fois), Contrôle relâché.
let n = Int(CommandLine.arguments.dropFirst().first ?? "1") ?? 1
let src = CGEventSource(stateID: .hidSystemState)
func key(_ code: CGKeyCode, _ down: Bool, _ flags: CGEventFlags) {
  let e = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: down)!
  e.flags = flags
  e.post(tap: .cghidEventTap)
  usleep(60000)
}
key(59, true, .maskControl)
for _ in 0..<n { key(48, true, .maskControl); key(48, false, .maskControl); usleep(150000) }
usleep(300000)
key(59, false, [])
