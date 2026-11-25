### Fixed

- Pokebots custom build on macOS: the sidebar now says "Updates are off" when the update job is not loaded or has not run for 20 minutes. Retry turns the job back on and starts a check.
- Pokebots custom build on macOS: `custom-auto-update-setup.sh --run-now` no longer reloads a loaded job, so it cannot stop a running build or leave the job unloaded. A failed load is tried again and fails loudly, and a run that died while building recovers on the next check.
