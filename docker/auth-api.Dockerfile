FROM node:24.12.0-bookworm-slim AS build
COPY --from=oven/bun:1.4.3-debian /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
ARG SOURCE_COMMIT=development
# Keep the image on its existing self-hosted brand and endpoint profile.
ENV SELF_HOSTED=1 OPENBOT_BRAND_NAME=Pokebots
ENV OPENBOT_BRAND_AUTH_API_URL=https://api.pokebots.xyz
ENV OPENBOT_BRAND_SIGNAL_URL=wss://signal.pokebots.xyz/v1/signal
# This is the account/web image only. Electron is never built here.
RUN node -e 'const fs=require("node:fs"); let sha=process.env.SOURCE_COMMIT; if(fs.existsSync(".git/HEAD")){const head=fs.readFileSync(".git/HEAD","utf8").trim(); if(head.startsWith("ref: ")){const ref=head.slice(5);if(fs.existsSync(".git/"+ref))sha=fs.readFileSync(".git/"+ref,"utf8").trim();else if(fs.existsSync(".git/packed-refs"))sha=fs.readFileSync(".git/packed-refs","utf8").split("\n").find(line=>line.endsWith(" "+ref))?.split(" ")[0]||sha;}else sha=head;} fs.writeFileSync(".source-commit",sha||"development");' \
  && bun run --cwd apps/auth-api build

RUN mkdir /runtime \
  && bun build apps/auth-api/dist/server/worker-entry.js --target=bun --outfile=/runtime/worker.js \
  && bun -e 'const m=await import("/runtime/worker.js"); if(typeof m.default.fetch!=="function" || typeof m.default.scheduled!=="function") throw new Error("Account worker handlers missing");' \
  && bun apps/auth-api/scripts/self-hosted-image-e2e.ts /runtime/worker.js \
  && bun build apps/auth-api/src/self-hosted/server.ts --target=bun --outfile=/runtime/server.js \
  && bun build apps/auth-api/scripts/self-hosted-import.ts --target=bun --outfile=/runtime/import.js

FROM oven/bun:1.4.3-debian
WORKDIR /app
ARG SOURCE_COMMIT=development
ENV NODE_ENV=production PORT=3000 SELF_HOSTED_DATA_DIR=/data SOURCE_COMMIT=$SOURCE_COMMIT
COPY --from=build /app/.source-commit ./.source-commit
COPY --from=build /runtime/scheduled-e2e.json ./verification/scheduled-e2e.json
COPY --from=build /app/apps/auth-api/dist/client ./apps/auth-api/dist/client
COPY --from=build /runtime/worker.js ./apps/auth-api/dist/server/worker-entry.js
COPY --from=build /runtime/server.js ./apps/auth-api/src/self-hosted/server.js
COPY --from=build /runtime/import.js ./apps/auth-api/scripts/self-hosted-import.js
COPY --from=build /app/apps/auth-api/migrations ./apps/auth-api/migrations
RUN mkdir /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e 'const r = await fetch("http://127.0.0.1:3000/health/ready"); process.exit(r.ok ? 0 : 1)'
CMD ["bun", "apps/auth-api/src/self-hosted/server.js"]
