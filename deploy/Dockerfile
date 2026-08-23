# Menagerie profile server — zero dependencies, no build step, no npm install.
# Build from the REPO ROOT:   docker build -f deploy/Dockerfile -t moxy-sync .
# Run:                        docker run -d -p 8787:8787 -v moxy-sync-data:/data moxy-sync
FROM node:24-slim

# Only the server and the shared wire-contract files, keeping the relative
# layout the server's imports expect (../libs/core/src/hatch/…).
WORKDIR /app
COPY server/ server/
COPY libs/core/src/hatch/hatch-api.ts libs/core/src/hatch/hatch-api.ts
COPY libs/core/src/hatch/constants.ts libs/core/src/hatch/constants.ts

RUN mkdir /data && chown node:node /data
USER node
VOLUME /data

ENV PORT=8787 \
    MOXY_DB_PATH=/data/moxy-sync.db
EXPOSE 8787

CMD ["node", "server/moxy-sync-server.ts"]
