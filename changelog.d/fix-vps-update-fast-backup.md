### Fixed

- An Install from Server Settings > Updates on a Pokebots VPS server stops the server for seconds, not minutes. The host copies the data to a mirror while the server runs, and while the server is stopped it copies only the last changes. It compresses the backup after the server is online again. On the Personal VPS, the copy while stopped went from 288 s to about 8 s. Download caches (Bun, npm, Playwright, Chromium) are not in the backup.
