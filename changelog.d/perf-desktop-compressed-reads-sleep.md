### Changed

- The desktop app reads chats from a joined server faster on a slow link. It asks the server for compressed answers, as the web client does. A 25 KB chat page now crosses the network as about 3 KB. A server without this feature gets the same requests as before.

### Fixed

- A chat on a joined server no longer waits many minutes after the Mac wakes from sleep. Before, a read that started when the lid closed stayed open until the wake. Now it stops when the Mac goes to sleep, and the app reconnects and reads again when you open the Mac. The app also no longer tries to reconnect while the Mac sleeps.
