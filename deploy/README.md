# Deploying Menagerie

Two pieces: the **static app** (GitHub Pages at **menagerie.love**) and the
**profile server** (**api.menagerie.love**). The server is where the encrypted
profiles live — the app needs one configured to hatch or view anything.
(Internally the codebase, env vars, and config file keep their original
`moxy` names — see the main README's historical note.)

## DNS at the registrar (Porkbun)

| Type  | Host  | Answer                | Purpose |
|-------|-------|-----------------------|---------|
| ALIAS | (root)| `randolin.github.io`  | the app on GitHub Pages |
| CNAME | `www` | `randolin.github.io`  | www → same |
| A     | `api` | `<your server's IP>`  | the profile server (add when the box exists) |

Then in the repo: **Settings → Pages → Custom domain: `menagerie.love`** →
wait for the DNS check → tick **Enforce HTTPS**. GitHub provisions the
certificate automatically; the QR/view links pick up the new origin with no
code change.

## The app → GitHub Pages (automatic)

`.github/workflows/deploy.yml` runs the full test ladder on every push (core,
server, and app unit tests, production build, and the Playwright e2e suite)
and publishes `dist/moxy/browser` to GitHub Pages on pushes to the default
branch, stamping the profile-server URL into `moxy.config.json` from the
`MOXY_SERVER_URL` repository variable.

One-time setup:
1. Repo **Settings → Pages → Source: "GitHub Actions"**.
2. **Settings → Secrets and variables → Actions → Variables** → add
   `MOXY_SERVER_URL` = `https://api.menagerie.love` (your server, below).

The next push to the default branch goes live at
`https://<user>.github.io/<repo>/`.

Any other static host works identically: `npx ng build --base-href ./`, write
`{"serverUrl":"https://…"}` to `dist/moxy/browser/moxy.config.json`, and copy
`dist/moxy/browser/*`. Hash routing needs no rewrite rules anywhere, and
scanned QR codes (`…#/view/<phrase>`) deep-link directly.

## The profile server — option A: Docker

```sh
docker build -f deploy/Dockerfile -t moxy-sync .    # from the repo root
docker run -d --name moxy-sync --restart unless-stopped \
  -p 127.0.0.1:8787:8787 -v moxy-sync-data:/data moxy-sync
```

The SQLite database lives in the `moxy-sync-data` volume. Put TLS in front
(see the Caddyfile below) and add `-e MOXY_TRUST_PROXY=1` so rate limiting
sees real client addresses.

## The profile server — option B: systemd on a VPS

Needs Node ≥ 24 (`node:sqlite` + native TypeScript — no npm install, no build):

```sh
sudo mkdir -p /opt/moxy
sudo cp -r server libs /opt/moxy/
sudo cp deploy/moxy-sync.service /etc/systemd/system/
sudo systemctl enable --now moxy-sync
curl http://127.0.0.1:8787/v2/health   # → {"ok":true}
```

The database lands in `/var/lib/moxy-sync/` (managed by systemd's
`StateDirectory`; the unit runs as an ephemeral `DynamicUser` with a
read-only filesystem view otherwise).

Garbage collection runs inside the server (defaults: empty profiles after
7 days, idle-and-unviewed profiles after 12 months, sweeping hourly) —
override with `MOXY_GC_EMPTY_MS` / `MOXY_GC_IDLE_MS` / `MOXY_GC_SWEEP_MS`,
and cap total profiles with `MOXY_MAX_PROFILES`.

## TLS in front (either option)

`deploy/Caddyfile` is a two-line Caddy config with automatic Let's Encrypt:

```
api.menagerie.love {
    reverse_proxy 127.0.0.1:8787
}
```

nginx or traefik work the same way — terminate TLS, proxy to `:8787`.

## Last step: point the app at it

Set the `MOXY_SERVER_URL` repository variable (step 2 above) so deploys stamp
it into `moxy.config.json`, or on any single browser use the landing page's
"Use this server" field. The server can never read what it stores — see the
README's threat-model section.
