### Fixed

- A server no longer puts off its update for days because messages or routine runs wait for a spent
  plan. That work is saved and starts again after the restart, so only work that can run now holds
  an update.
