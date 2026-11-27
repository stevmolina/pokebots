### Fixed

- An Install from Server Settings > Updates on a Pokebots VPS server is faster. While the server is stopped, the host no longer copies the node_modules folders in agent folders (most of the files); it copies them to the backup after the server is online. It also installs the staged image without a new download, and sees the new server online sooner. The server must run this version of the update script: run `sudo openbot-vps-update setup` from the new `docker/vps-update` folder.
- The update window of a VPS server named the build of the first download, while the server installed a newer build that it had staged after it. The window now names the build that the server installs.
