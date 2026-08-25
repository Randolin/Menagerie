# Deploying Menagerie

Two pieces: the **static app** (GitHub Pages at **menagerie.love**) and the
**profile server** (**api.menagerie.love**). The server is where the encrypted
profiles live — the app needs one configured to hatch or view anything.
(Internally the codebase, env vars, and config file keep their original
`moxy` names — see the main README's historical note.)

## DNS at the registrar (Porkbun)

| Type  | Host   | Answer               | Purpose                                      |
| ----- | ------ | -------------------- | -------------------------------------------- |
| ALIAS | (root) | `randolin.github.io` | the app on GitHub Pages                      |
| CNAME | `www`  | `randolin.github.io` | www → same                                   |
| A     | `api`  | `<your server's IP>` | the profile server (add when the box exists) |

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

## Updating from your phone

The server's data (SQLite) lives in the `moxy-sync-data` Docker volume, so
updating never touches profiles: pull, rebuild the image, swap the
container. Three ways to run that cycle, all workable from Android.

### One-time: get a shell from the phone

Install **Termux** (F-Droid build) or a friendlier SSH app like **Termius**,
then connect with the root password from Hetzner's provisioning email:

```sh
pkg install openssh          # Termux only
ssh root@<server-ip>
```

Make future logins one tap by installing a key from the phone:

```sh
ssh-keygen -t ed25519        # on the phone, accept defaults
ssh-copy-id root@<server-ip>
```

### The manual cycle (save as a snippet)

```sh
cd /opt/menagerie      # wherever the repo was cloned on the box
git pull
docker build -f deploy/Dockerfile -t moxy-sync .
docker stop moxy-sync && docker rm moxy-sync
docker run -d --name moxy-sync --restart unless-stopped \
  -p 127.0.0.1:8787:8787 -v moxy-sync-data:/data -e MOXY_TRUST_PROXY=1 moxy-sync
curl -s http://127.0.0.1:8787/v2/health
```

`deploy/update.sh` is the same cycle with guard rails (build before swap, a
health check, and a no-op when nothing changed):

```sh
MOXY_REPO_DIR=/opt/menagerie /opt/menagerie/deploy/update.sh --force
```

### Hands-free option 1: the box follows main (recommended)

A systemd timer runs `update.sh` every 10 minutes and cycles only when
`origin/main` moved — merging a PR _is_ deploying, and CI already gates
main. Paste once, on the box:

```sh
cp /opt/menagerie/deploy/moxy-update.service /etc/systemd/system/
cp /opt/menagerie/deploy/moxy-update.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now moxy-update.timer
systemctl list-timers moxy-update.timer     # sanity check
```

(If your clone lives elsewhere, edit `MOXY_REPO_DIR` and the `ExecStart`
path in the service file first.)

### Hands-free option 2: a "Redeploy server" button in the GitHub app

`.github/workflows/redeploy-server.yml` is a manual workflow that SSHes to
the box with a **single-purpose key**: its `authorized_keys` entry carries a
forced command, so the key can trigger `update.sh --force` and nothing else.
One-time wiring:

1. On the phone: `ssh-keygen -t ed25519 -f menagerie-deploy -N ""` — this
   makes `menagerie-deploy` (private) and `menagerie-deploy.pub` (public).
2. On the box, append ONE line to `/root/.ssh/authorized_keys` — the
   forced-command prefix, then the full contents of `menagerie-deploy.pub`:

   ```
   command="MOXY_REPO_DIR=/opt/menagerie /opt/menagerie/deploy/update.sh --force",restrict <contents of menagerie-deploy.pub>
   ```

3. In the repo: **Settings → Secrets and variables → Actions → Secrets** →
   add `DEPLOY_SSH_KEY` (the full contents of the private `menagerie-deploy`
   file) and `DEPLOY_HOST` (`api.menagerie.love` or the IP).

From then on: GitHub app → **Actions → Redeploy server → Run workflow**.
The run's log shows the script's output, ending in `{"ok":true}`.
