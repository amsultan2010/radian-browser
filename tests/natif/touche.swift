import CoreGraphics
import Foundation
// Envoie une touche au système, comme un vrai clavier.
//   touche <code de touche> [cmd] [ctrl] [alt] [shift]
let args = Array(CommandLine.arguments.dropFirst())
guard let code = args.first.flatMap({ UInt16($0) }) else { exit(2) }
var flags: CGEventFlags = []
if args.contains("cmd") { flags.insert(.maskCommand) }
if args.contains("ctrl") { flags.insert(.maskControl) }
if args.contains("alt") { flags.insert(.maskAlternate) }
if args.contains("shift") { flags.insert(.maskShift) }
let src = CGEventSource(stateID: .hidSystemState)
for down in [true, false] {
  let e = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: down)!
  e.flags = flags
  e.post(tap: .cghidEventTap)
  usleep(50000)
}
