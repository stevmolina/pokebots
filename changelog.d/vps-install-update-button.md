### Added

- A Pokebots VPS server downloads new server images by itself and installs one only when an owner or an admin selects Install in Server Settings > Updates. The host backs up the data before the install, and goes back to the old image and data when the new one does not come online. `docker/vps-update` installs it with one command (`openbot-vps-update setup`).
- Server Settings > Updates shows the build of a Pokebots server image, for example "Update ready: build 9c41d2e07". The server must also be on this version.

### Changed

- The VPS server no longer replaces its container by itself. `openbot-vps-update setup` removes the old automatic swap (`openbot-vps-auto-update`).
