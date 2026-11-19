### Added

- Let agents on your joined servers run terminal commands and copy files on your computer, through the same link as Computer Use. A second switch under Settings > Computer Use > Agents on your servers turns it on for each server. It starts off, it turns off when the first switch turns off or you press Stop, and each use shows in the sessions list. A copied file lands in the agent's `from-mac` folder on the server. A server must also be on this version.

### Fixed

- Let joined-server agents call their assigned computer through `openbot.tool_call` when the provider omits a Computer Use tool.
