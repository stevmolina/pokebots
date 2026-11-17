### Changed

- A server (hosted, self-hosted or Docker) downloads the Claude, Codex, Cursor and Grok CLIs at its
  start when they are on and missing, so a new server shows them ready for sign-in instead of "Not
  downloaded". A CLI that the user installed stays in use, and a provider that is off downloads
  nothing.
