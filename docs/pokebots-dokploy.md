# Pokebots on Dokploy

The Pokebots account API and browser app run as one Bun service on Contabo.
The public landing page runs as a separate static Nginx service on the same Dokploy server.
The Cloudflare Worker build remains available for other deployments. No desktop data moves.

## Deployment

- Project: `Pokebots`, production environment on `dokploy-eu.stevmolina.com`.
- Source: `stevmolina/pokebots`, branch `main`, generic Git source.
- Image: `docker/auth-api.Dockerfile`, repository root context.
- Runtime: one replica, port 3000, 1 GiB memory, one CPU.
- Mount: `/srv/pokebots-auth/data` to `/data`. Keep it on the same node.
- Update and rollback: `stop-first`, one task at a time. Never use `start-first` with SQLite.
- Account service domains: `api.pokebots.xyz` and `app.pokebots.xyz`, HTTPS through Traefik.
- A GitHub push webhook calls Dokploy directly. Only `main` and matching watch paths deploy.
  There is no GitHub Actions deployment job. Keep the webhook URL private.
- Credentials belong to Doppler `pokebots/prd` and Dokploy runtime settings. They are not build args.
  Do not enable Dokploy's environment-file creation for this image.

### Landing page

- Application: `Pokebots landing`, service `pokebots-landing-hale0u`.
- Source: `stevmolina/pokebots-landing`, branch `main`, generic Git source.
- Build: Dokploy static build, publish directory `.`, no SPA rewrite, port 80.
- Runtime: one replica, 128 MiB memory, 0.25 CPU, `stop-first` updates.
- Domain: `pokebots.xyz`, HTTPS through Traefik with Let's Encrypt.
- A separate GitHub push webhook deploys main changes to the page, service worker, and images.
  The landing has no account database, runtime secret, or persistent volume.

The source HTML, service worker, and all 17 referenced images match the previous OVH deployment.
The OVH copy at `/srv/stacks/pokebots/site` remains for rollback. To roll back only the landing,
restore the apex DNS A record to `192.99.212.2`. Leave the account service domains on Contabo.
The landing's current DNS A record is DNS-only `77.237.245.18`. Do not remove the old copy until
its rollback role ends.

### Account proxy boundary

`SELF_HOSTED_TRUST_PROXY=true` is permitted only behind Traefik on its private Docker network.
Do not publish container port 3000. Traefik must overwrite `X-Real-IP` and `X-Forwarded-Proto`.
The service rejects an origin outside `SELF_HOSTED_ORIGINS` and ignores `X-Forwarded-Host`.
The browser API keeps its same-origin, JSON, custom-header, and secure-cookie checks. It grants
no cross-origin browser access. Native clients keep their existing bearer API.

`/health/ready` checks SQLite and returns the image revision. `/app-sw.js` must not be cached.
The `app` host redirects `/` to `/app` and serves the old `/sw.js` removal script.
Scheduled jobs use UTC minute boundaries. Shutdown stops requests and drains background work.
In-memory request limits reset at a restart, as they do when a Worker instance is replaced.

## Checks

Run one command at a time:

```sh
bun scripts/auth-api-storage-e2e.ts
bun run --cwd apps/auth-api typecheck
AUTH_API_SMOKE_ORIGIN=http://127.0.0.1:3000 bun scripts/auth-api-self-hosted-smoke.ts
```

The storage check writes `.openbot-build/auth-api-storage-e2e.json`. It starts a real storage
process, kills it, restarts it, and checks retained rows, object content, batch rollback,
conditional reads, deletion, failed-migration rollback, and framework-log redaction. CI runs this script in the API job.
The HTTP check writes `.openbot-build/auth-api-self-hosted-smoke.json`.
Build and validate the image on the VPS with its resource-limited buildx builder.

## Data transfer and cutover

1. Save current DNS, Worker routes, custom domains, deployment version, and settings securely.
   Keep Cloudflare D1 and R2. Keep `/srv/stacks/pokebots-signal` and TURN in place.
2. Inspect the live D1 schema. Check R2 object listings, not only delayed bucket metrics.
   If any objects exist, copy and verify each key and checksum before proceeding.
3. Use an imported copy to verify the new service first. Add a second WorkOS client secret
   instead of deleting the old one. Keep both signing public keys accepted by Signal.
4. At cutover, stop writes to the old Worker with a maintenance response. Stop its cron too.
   Export D1 again after the write freeze. Take a final R2 listing, even when the first was empty.
   Copy and verify each new or changed object before the new service starts.
   Keep the SQL export private and record its SHA-256.
5. Stop the new service. Import into a new filename with:

   ```sh
   bun apps/auth-api/scripts/self-hosted-import.ts export.sql /data/pokebots.sqlite
   # In the image, use /app/apps/auth-api/scripts/self-hosted-import.js.
   ```

   The command refuses an existing destination. It checks SQLite integrity, foreign keys,
   and migration parity. Its JSON output has row counts and hashes for every application table.
   Compare them with the frozen source before routing traffic. Keep each previous database file.
6. Start the new service. Check health, login, account sessions, host tickets, Signal readiness,
   and a container restart. Change DNS and remove Worker routes only after those checks pass.
7. Check all public domains over TLS. Verify a real `main` merge webhook and its deployed image.

## Rollback

Before the new service accepts writes, restore the saved Worker version and routes, then DNS.
The old WorkOS secret and ticket key remain valid. Keep the imported data for inspection.
After the new service accepts writes, never point clients at the old D1 copy. Stop writes,
back up the current `/data` with SQLite closed, and deploy the previous image against that same
data only if its schema is compatible. Otherwise fix forward, or export and verify the current
SQLite data into D1 before restoring Worker traffic. A DNS-only rollback loses new accounts
and session changes. Do not do it.

For daily backups, stop the service. Copy the database together
with all R2 directories. Copying only `pokebots.sqlite` while WAL writes run is not a backup.
Object bodies use immutable filenames and metadata in SQLite. An interrupted write can leave
an unreferenced file. Startup removes only unreferenced UUID files from the object directory.

## Feedback GitHub App

The Pokebots build uses `stevmolina/pokebots` for feedback. In Dokploy, set
`FEEDBACK_GITHUB_APP_CLIENT_ID` and `FEEDBACK_GITHUB_APP_PRIVATE_KEY` for the
dedicated GitHub App. The service needs a PKCS #8 PEM. Convert GitHub's
downloaded key with `openssl pkcs8 -topk8 -nocrypt` in a secure input pipeline.

Give the private app repository Issues read and write. Disable webhooks.
Install it on selected repositories only: `stevmolina/pokebots` and a private
issue archive under `stevmolina`. Set `FEEDBACK_WITHDRAWN_REPOSITORY` to that
archive's full name. The app uses the archive to move withdrawn issues with
their edit history. It deletes an account's duplicate comments in place.

Keep the feedback signing key stable while reports can still be withdrawn.
Its value also signs the ownership marks on submitted feedback. The shared
GitHub integration continues to use the existing `GITHUB_APP_*` settings.
