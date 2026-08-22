# Deploying Moxy

Two independent pieces: the **static app** (required) and the **sync server**
(optional — the app is fully functional without it).

## The app → GitHub Pages (automatic)

`.github/workflows/deploy.yml` runs the full test ladder on every push (core,
server, and app unit tests, production build, and the Playwright e2e suite)
and publishes `dist/moxy/browser` to GitHub Pages on pushes to the default
branch.

One-time setup: repo **Settings → Pages → Source: "GitHub Actions"**. That's
it — the next push to the default branch goes live at
`https://<user>.github.io/<repo>/`.

Any other static host works identically: `npx ng build --base-href ./` and
copy `dist/moxy/browser/*`. Hash routing needs no rewrite rules anywhere.

## The sync server — option A: Docker

```sh
docker build -f deploy/Dockerfile -t moxy-sync .    # from the repo root
docker run -d --name moxy-sync --restart unless-stopped \
  -p 127.0.0.1:8787:8787 -v moxy-sync-data:/data moxy-sync
```

The SQLite database lives in the `moxy-sync-data` volume. Put TLS in front
(see the Caddyfile below) and add `-e MOXY_TRUST_PROXY=1` so rate limiting
sees real client addresses.

## The sync server — option B: systemd on a VPS

Needs Node ≥ 24 (`node:sqlite` + native TypeScript — no npm install, no build):

```sh
sudo mkdir -p /opt/moxy
sudo cp -r server libs /opt/moxy/
sudo cp deploy/moxy-sync.service /etc/systemd/system/
sudo systemctl enable --now moxy-sync
curl http://127.0.0.1:8787/v1/health   # → {"ok":true}
```

The database lands in `/var/lib/moxy-sync/` (managed by systemd's
`StateDirectory`; the unit runs as an ephemeral `DynamicUser` with a
read-only filesystem view otherwise).

## TLS in front (either option)

`deploy/Caddyfile` is a two-line Caddy config with automatic Let's Encrypt:

```
sync.example.org {
    reverse_proxy 127.0.0.1:8787
}
```

nginx or traefik work the same way — terminate TLS, proxy to `:8787`.

## Last step: point the app at it

Open the deployed app → **Vault** → enter `https://sync.example.org` in the
Sync server field → Enable sync. Users on other devices enter the same server
address plus their passphrase, and their encrypted vault follows them. The
server can never read what it stores — see the README's threat-model section.
