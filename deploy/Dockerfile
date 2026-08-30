# Menagerie profile server — zero dependencies, no build step, no npm install.
# Build from the REPO ROOT:   docker build -f deploy/Dockerfile -t menagerie-sync .
# Run:                        docker run -d -p 8787:8787 -v menagerie-sync-data:/data menagerie-sync
FROM node:24-slim

# Only the server and the shared wire-contract files, keeping the relative
# layout the server's imports expect (../libs/core/src/…). Every ../libs
# import in server/ MUST have a COPY line here — server/deploy.spec.ts
# fails the suite if the two drift apart.
WORKDIR /app
# Three lines of package.json, and not the repo's own: it declares the module
# type so the container resolves `.ts` exactly as the repo does. Without it
# Node has to guess, and a file that happens to parse as CommonJS would load
# one way here and another way in CI — the sort of divergence that is only
# ever found in production. The repo's package.json is deliberately NOT
# copied: this image installs nothing, and its dependency list would only
# invalidate the layer cache. `server/deploy.spec.ts` keeps the two in step.
COPY deploy/server-package.json package.json
COPY server/ server/
COPY libs/core/src/hatch/hatch-api.ts libs/core/src/hatch/hatch-api.ts
COPY libs/core/src/hatch/constants.ts libs/core/src/hatch/constants.ts
COPY libs/core/src/group/group-api.ts libs/core/src/group/group-api.ts
COPY libs/core/src/metrics/metrics-api.ts libs/core/src/metrics/metrics-api.ts
COPY libs/core/src/boop/boop-api.ts libs/core/src/boop/boop-api.ts

RUN mkdir /data && chown node:node /data
USER node
VOLUME /data

ENV PORT=8787 \
    MENAGERIE_DB_PATH=/data/menagerie-sync.db
EXPOSE 8787

CMD ["node", "server/menagerie-sync-server.ts"]
