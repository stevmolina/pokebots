### Added

- Friend servers on the VPS now update themselves from `ghcr.io/stevmolina/pokebots:latest`, like
  the Mac app and the main server: every 10 minutes, only when no agent is working, with a verified
  backup first and an automatic restore if the new version does not come back.
