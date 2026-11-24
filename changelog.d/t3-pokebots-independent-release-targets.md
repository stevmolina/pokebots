### Changed

- Pull requests now also freeze the database migrations that the base branch already has. Pokebots
  installs commits of `main`, so a migration on `main` can already be in your database.
- Pokebots releases use their own versions, starting at `1.0.0`, and the `v<version>` tag.
- Release jobs for the iPhone and Android stores, over-the-air updates, the update Worker and the
  Discord announcement run only for `nightly-labs/openbot`. Pokebots publishes to none of them.
