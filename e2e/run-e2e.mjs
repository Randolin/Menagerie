// Moxy end-to-end suite. Serves the PRODUCTION build (dist/moxy/browser) with
// a plain static file server and drives the real UI in Chromium via
// playwright-core, against a real spawned profile server on its own origin
// (so CORS is genuinely exercised).
//
// Run: npm run build && npm run e2e
// Env: MOXY_E2E_SHOTS=dir to also capture screenshots.
import { chromium } from 'playwright-core';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createReadStream, existsSync, statSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(root, 'dist', 'moxy', 'browser');
const CHROMIUM = process.env.CHROMIUM_BIN ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOTS = process.env.MOXY_E2E_SHOTS ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist not found — run `npm run build` first');
  process.exit(1);
}

// --- dumb static server (no rewrites: hash routing must need none) ---------
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(DIST, path === '/' ? 'index.html' : path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// --- profile servers, each on its own origin -------------------------------
// Rate limits get generous headroom: the whole suite hammers one IP, and on a
// fast runner it fits inside a single refill window — production defaults
// would 429 mid-scenario. The limiters have their own server tests.
const spawnMoxyServer = async (env) => {
  const proc = spawn(process.execPath, [join(root, 'server/moxy-sync-server.ts')], {
    env: {
      ...process.env,
      PORT: '0',
      MOXY_READS_PER_MINUTE: '100000',
      MOXY_WRITES_PER_MINUTE: '100000',
      MOXY_BOOPS_PER_MINUTE: '100000',
      MOXY_METRICS_PER_MINUTE: '100000',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('profile server did not start')), 15000);
    let buffer = '';
    proc.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      const match = buffer.match(/\{"listening":(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    proc.on('exit', () => reject(new Error('profile server exited during startup')));
  });
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${url}/v2/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (i > 50) throw new Error('profile server health never came up');
    await new Promise((r) => setTimeout(r, 100));
  }
  return { proc, url };
};

const dbPath = join(tmpdir(), `moxy-e2e-${process.pid}.db`);
const main = await spawnMoxyServer({ MOXY_DB_PATH: dbPath });
// Fast-sweeping GC server on a file DB. Timestamps are hour-coarse and the
// sweep grants that hour back as slack (TTLs are minimum lifetimes), so
// short TTLs alone can't expire anything — the test backdates created_at
// through a second SQLite connection instead, exactly like a real aged row.
const gcDbPath = join(tmpdir(), `moxy-e2e-gc-${process.pid}.db`);
const gc = await spawnMoxyServer({
  MOXY_DB_PATH: gcDbPath,
  MOXY_GC_EMPTY_MS: '3000',
  MOXY_GC_IDLE_MS: String(365 * 24 * 3600 * 1000),
  MOXY_GC_SWEEP_MS: '1000',
});
// Metrics server with k=1 so a single contributor clears the floor. Its own
// instance also keeps the MAIN db's at-rest scan strict: aggregate counters
// are plaintext BY DESIGN, and only exist where someone opted in.
const metricsDbPath = join(tmpdir(), `moxy-e2e-metrics-${process.pid}.db`);
const metricsSrv = await spawnMoxyServer({
  MOXY_DB_PATH: metricsDbPath,
  MOXY_METRICS_K: '1',
});

const browser = await chromium.launch({ executablePath: CHROMIUM });
const errors = [];
let step = '';
const fail = (msg) => {
  throw new Error(`[${step}] ${msg}`);
};

const contexts = [];
/** Fresh browser context with the profile server seeded via localStorage. */
async function freshPage(serverUrl = main.url, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, ...options });
  contexts.push(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${step}: ${String(e)}`));
  // Zoneless Angular routes unhandled async errors to console.error, which
  // pageerror never sees — capture them too. Plain HTTP-status noise is
  // exempt: dead-link 404s are asserted app behavior, not defects.
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
      errors.push(`${step} console: ${m.text()}`);
    }
  });
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE);
  if (serverUrl) {
    await page.evaluate((url) => localStorage.setItem('moxy.server.v2', url), serverUrl);
    await page.reload();
  }
  return page;
}

const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, name), fullPage: true });
};

/** Hatch on a fresh page — click, then wait out the Argon2id derivation. */
async function hatchProfile(serverUrl = main.url, options = {}) {
  const page = await freshPage(serverUrl, options);
  await page.click('text=Hatch a profile');
  await page.waitForSelector('.passphrase-box', { timeout: 60000 });
  return page;
}

/** The raw server DB bytes (main file plus WAL/SHM sidecars), as latin1. */
function rawDbBytes(path) {
  let bytes = '';
  for (const suffix of ['', '-wal', '-shm']) {
    const f = path + suffix;
    if (existsSync(f)) bytes += readFileSync(f, 'latin1');
  }
  return bytes;
}

/**
 * Decode the dashboard's styled QR. Element screenshots capture the page
 * REGION, so the fixed toast is display:none'd (instant, transition-proof)
 * and the SVG is enlarged (~2.8 px/module at the 208px default is marginal
 * for jsQR), with retries against re-renders.
 */
async function decodeQr(page, expected) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(() => {
      const toast = document.getElementById('toast');
      if (toast) toast.style.display = 'none';
    });
    await page.locator('.qr-svg > svg').evaluate((el) => {
      el.style.width = '640px';
      el.style.height = '640px';
    });
    const png = PNG.sync.read(await page.locator('.qr-svg > svg').screenshot());
    const hit = jsQR(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
      png.width,
      png.height,
    );
    await page
      .locator('.qr-svg > svg')
      .evaluate((el) => {
        el.style.width = '';
        el.style.height = '';
      })
      .catch(() => {});
    if (hit?.data === expected) {
      await page.evaluate(() => {
        const toast = document.getElementById('toast');
        if (toast) toast.style.display = '';
      });
      return hit.data;
    }
    await page.waitForTimeout(300);
  }
  return null;
}

/**
 * Categories are added to the profile page, not navigated to. Adding is
 * idempotent here: an already-added category simply isn't in the menu.
 */
async function addCategory(page, title) {
  const card = page.locator('.category-card', { hasText: title });
  if (await card.count()) return card.first();
  await page.click('.add-trigger');
  await page.locator('.add-option', { hasText: title }).click();
  await page.waitForSelector(`.category-card:has-text("${title}")`);
  return page.locator('.category-card', { hasText: title }).first();
}

/** Save via the bar that appears only while there are unsaved edits. */
async function saveProfile(page) {
  await page.waitForSelector('.save-bar');
  await page.click('.save-bar button');
  // Generous: the sandbox CPU is shared with two spawned servers, and other
  // contexts may be mid-Argon2id (64 MiB x 3 passes) at the same time.
  await page.waitForSelector('.save-bar', { state: 'detached', timeout: 45000 });
}

/** Add a category, edit it in place, then save. */
async function editCategory(page, title, edit) {
  const card = await addCategory(page, title);
  await edit(card);
  await saveProfile(page);
}

/**
 * Importance lives behind a per-row marker; open it before touching weights.
 */
async function openImportance(row) {
  await row.locator('.q-mark').click();
  await row.locator('.weight-row').waitFor();
}

/** Three "What I value" scales, tick 3 of 0..6 on each. */
async function answerValues(page) {
  await editCategory(page, 'What I value', async (card) => {
    for (const anchor of ['Togetherness', 'Novelty & adventure', 'Heart decides']) {
      await card.locator('.q-row', { hasText: anchor }).locator('.pip-scale').nth(3).click();
    }
  });
}

try {
  // --- landing: no server configured is an honest, explicit state ----------
  step = 'landing-unconfigured';
  const page = await freshPage(null); // no seeding — moxy.config.json is empty
  await page.waitForSelector('text=No profile server is configured');
  if (!(await page.locator('button:has-text("Hatch a profile")').isDisabled())) {
    fail('hatch enabled with no server configured');
  }
  await shot(page, '01-landing-unconfigured.png');

  // The demo is the one page that must survive a missing server: it is what a
  // newcomer is shown before they commit to anything, and it never fetches.
  step = 'demo-unconfigured';
  await page.click('text=See a comparison first');
  await page.waitForSelector('text=brave-azure-otter', { timeout: 30000 });
  const demoBody = await page.textContent('body');
  for (const expected of ['Overall alignment', 'Mutual desires', 'Fit, each way']) {
    if (!demoBody.includes(expected)) fail(`demo is missing "${expected}" with no server`);
  }
  // The dealbreaker alert and the mutual reveal are the two moments the demo
  // exists to show; a demo that quietly lost them would still look fine.
  if (!demoBody.includes('Alcohol')) fail('demo does not name the violated dealbreaker');
  // The narrative is the only part of a comparison a screen reader can read,
  // so it has to be present, not just present in a unit test.
  if (!demoBody.includes('In words')) fail('demo is missing the narrative panel');
  if (!demoBody.includes('conversation to have, not a score to fix')) {
    fail('narrative does not frame the dealbreaker as a conversation');
  }
  if (demoBody.includes('On Pronouns')) fail('narrative frames identity as a difference');
  if (!demoBody.includes('Cuddling')) fail('demo does not reveal the mutual desire');
  // Desires are mutual-only: a one-sided answer must not appear anywhere.
  if (demoBody.includes('Massage')) fail('demo revealed a one-sided desire');
  await shot(page, '01b-demo-unconfigured.png');
  await page.goto(BASE);

  // --- the app survives losing the network -----------------------------
  // The service worker caches this origin's static files and nothing else,
  // so the shell has to come back offline while the profile server does not.
  step = 'offline-shell';
  const offline = await freshPage();
  await offline.waitForFunction(() => navigator.serviceWorker.controller !== null, {
    timeout: 30000,
  });
  await offline.context().setOffline(true);
  await offline.reload();
  await offline.waitForSelector('.brand', { timeout: 30000 });
  if (!(await offline.textContent('body')).includes('Menagerie')) {
    fail('the app shell did not come back offline');
  }
  // A cached profile would be a cached profile: the worker must never have
  // touched the profile server's origin.
  const cachedOrigins = await offline.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const name of names) {
      for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
    }
    return [...new Set(urls.map((u) => new URL(u).origin))];
  });
  await offline.context().setOffline(false);
  if (cachedOrigins.some((origin) => origin !== new URL(BASE).origin)) {
    fail(`the cache holds a foreign origin: ${cachedOrigins.join(', ')}`);
  }

  step = 'landing-configure';
  await page.fill('input[aria-label="Profile server URL"]', main.url);
  await page.click('text=Use this server');
  await page.waitForSelector('button:has-text("Hatch a profile"):not([disabled])');
  await shot(page, '02-landing.png');

  // --- hatch: profile, QR, and both phrases exist before any answer --------
  step = 'hatch';
  await page.click('text=Hatch a profile');
  await page.waitForSelector('.passphrase-box', { timeout: 60000 });
  const editPhrase = (await page.textContent('.passphrase-box')).trim();
  if (editPhrase.split(' ').length !== 5) fail(`edit phrase not 5 words: "${editPhrase}"`);
  const noticeText = await page.textContent('.card:has(.passphrase-box)');
  if (!noticeText.includes('7 days') || !noticeText.includes('12 months')) {
    fail('GC policy missing from the hatch notice');
  }
  const viewPhrase = (await page.textContent('.code-box')).trim();
  if (!/^[a-z]+(-[a-z]+){5}$/.test(viewPhrase)) fail(`view phrase malformed: "${viewPhrase}"`);
  const personaName = (await page.textContent('.persona-name')).trim();
  if (personaName !== viewPhrase.split('-').slice(0, 3).join('-')) {
    fail(`persona "${personaName}" is not the phrase head of "${viewPhrase}"`);
  }
  await shot(page, '03-dashboard-hatched.png');

  step = 'qr-decode';
  const viewUrl = `${BASE}#/view/${viewPhrase}`;
  if ((await decodeQr(page, viewUrl)) === null) fail('QR did not decode to the view URL');

  // --- the edit-phrase notice cannot be dismissed until acknowledged --------
  step = 'notice-dismiss';
  const dismiss = page.locator('.card-danger button', { hasText: 'I’ve saved it' });
  if (await dismiss.isEnabled()) fail('edit-phrase notice was dismissable before acknowledgement');
  await page.check('.ack-row input');
  await dismiss.click();
  await page.waitForSelector('.passphrase-box', { state: 'detached' });
  await page.reload(); // session survives via sessionStorage (guard re-derives keys)
  await page.waitForSelector('.profile-head', { timeout: 45000 });
  if (await page.locator('.passphrase-box').count()) fail('notice reappeared after dismissal');

  // --- hub-and-spoke section editing with explicit saves --------------------
  step = 'sections';
  await editCategory(page, 'About me', async (card) => {
    await card
      .locator('.q-row', { hasText: 'Pronouns' })
      .locator('.opt', { hasText: 'they/them' })
      .click();
    await card
      .locator('.q-row', { hasText: 'Age range' })
      .locator('.opt', { hasText: '25–34' })
      .click();
  });
  await editCategory(page, 'Connections I’m open to', async (card) => {
    await card
      .locator('.q-row', { hasText: 'Friendship' })
      .first()
      .locator('.pip', { hasText: 'Into it' })
      .click();
    await card
      .locator('.q-row', { hasText: 'Polyamory' })
      .locator('.pip', { hasText: 'Curious' })
      .click();
  });
  // Care given vs received — feeds the interlock flow diagram.
  await editCategory(page, 'How I connect', async (card) => {
    const give = card.locator('.q-row', { hasText: 'How I naturally show care' });
    await give.locator('.opt', { hasText: 'Physical touch' }).click();
    await give.locator('.opt', { hasText: 'Quality time' }).click();
    await card
      .locator('.q-row', { hasText: 'How care lands best for me' })
      .locator('.opt', { hasText: 'Words & affirmation' })
      .click();
  });
  // A dealbreaker: only "Never"/"Rarely" drinkers need apply.
  await editCategory(page, 'Everyday life', async (card) => {
    const alcohol = card.locator('.q-row', { hasText: 'Alcohol' });
    await alcohol.locator('.opt-grid .opt', { hasText: 'Never' }).click();
    await openImportance(alcohol);
    await alcohol.locator('button', { hasText: 'Dealbreaker' }).click();
    await alcohol.locator('.weight-accept .opt', { hasText: 'Never' }).click();
    await alcohol.locator('.weight-accept .opt', { hasText: 'Rarely' }).click();
  });
  await editCategory(page, 'Desires & play', async (card) => {
    await card
      .locator('.q-row', { hasText: 'Rope' })
      .first()
      .locator('.pip', { hasText: 'Into it' })
      .click();
    await card
      .locator('.q-row', { hasText: 'Impact play' })
      .locator('.pip', { hasText: 'Into it' })
      .click(); // one-sided vs B
  });
  const aboutCard = await page.textContent('.category-card:has-text("About me") .category-head');
  if (!aboutCard.includes('2 / ')) fail('category completion count not updated: ' + aboutCard);

  // --- the card stream: three values answered one card at a time ------------
  step = 'pack-runner';
  await answerValues(page);
  await shot(page, '04-dashboard-filled.png');

  // --- a second profile to compare against ----------------------------------
  step = 'profile-b';
  const pageB = await hatchProfile();
  const viewPhraseB = (await pageB.textContent('.code-box')).trim();
  const personaNameB = (await pageB.textContent('.persona-name')).trim();
  await editCategory(pageB, 'Connections I’m open to', async (card) => {
    await card
      .locator('.q-row', { hasText: 'Friendship' })
      .first()
      .locator('.pip', { hasText: 'Into it' })
      .click();
  });
  // B gives words (covers A's need); B needs acts (A leaves it unmet).
  await editCategory(pageB, 'How I connect', async (card) => {
    await card
      .locator('.q-row', { hasText: 'How I naturally show care' })
      .locator('.opt', { hasText: 'Words & affirmation' })
      .click();
    await card
      .locator('.q-row', { hasText: 'How care lands best for me' })
      .locator('.opt', { hasText: 'Acts of service' })
      .click();
  });
  // B drinks socially — a near-miss by ordinal distance, but outside A's
  // dealbreaker set, so only A's directional fit takes the hit.
  await editCategory(pageB, 'Everyday life', async (card) => {
    await card
      .locator('.q-row', { hasText: 'Alcohol' })
      .locator('.opt-grid .opt', { hasText: 'Socially' })
      .click();
  });
  await editCategory(pageB, 'Desires & play', async (card) => {
    await card
      .locator('.q-row', { hasText: 'Rope' })
      .first()
      .locator('.pip', { hasText: 'Curious' })
      .click();
  });
  await answerValues(pageB);

  // --- the QR bypass: a fresh device opens the view URL directly ------------
  step = 'view-fresh-context';
  const viewer = await freshPage();
  await viewer.goto(viewUrl);
  // The creature IS the display name — no nickname exists anywhere, and the
  // subject card's heading is now the creature name itself rather than
  // "<name>'s profile", so assert the name element directly.
  await viewer.waitForSelector('.persona-name', { timeout: 30000 });
  const viewedName = (await viewer.textContent('.persona-name')).trim();
  if (viewedName !== personaName) {
    fail(`view page heading is "${viewedName}", expected "${personaName}"`);
  }
  const viewerBody = await viewer.textContent('body');
  if (viewerBody.includes('Rope') || viewerBody.includes('Impact play')) {
    fail('desires leaked into the public view page');
  }
  if (!viewerBody.includes('they/them')) fail('open answers missing on the view page');
  await shot(viewer, '05-view.png');

  // --- edit login from a clean device recovers everything -------------------
  step = 'edit-login-fresh-context';
  const editor = await freshPage();
  await editor.goto(`${BASE}#/edit`);

  // A typo must be caught before Argon2id charges seconds for it, and must
  // say which word is wrong. Append a letter rather than dropping one:
  // dropping a letter can land on another real EFF word, and the phrase would
  // then be well-formed and go through the KDF on some runs and not others.
  const typo = editPhrase.replace(/^(\S+)/, '$1q');
  await editor.fill('input[aria-label="Edit phrase"]', typo);
  const beforeTypo = Date.now();
  await editor.click('text=Open my profile');
  await editor.waitForSelector('.notice-warn', { timeout: 10000 });
  const spent = Date.now() - beforeTypo;
  const complaint = await editor.textContent('.notice-warn');
  if (!complaint.includes('word 1')) fail(`typo complaint does not locate the word: ${complaint}`);
  // A derivation would take seconds; this path must never reach one.
  if (spent > 5000) fail(`typo took ${spent}ms — it went through the KDF`);

  await editor.fill('input[aria-label="Edit phrase"]', editPhrase);
  await editor.click('text=Open my profile');
  await editor.waitForSelector('.profile-head', { timeout: 30000 });
  // The edit-phrase notice reappears on a new device — that's the feature.
  if (!(await editor.locator('.passphrase-box').count())) {
    fail('edit-phrase notice missing on a new device');
  }
  if ((await editor.textContent('.code-box')).trim() !== viewPhrase) {
    fail('view phrase not recovered from blob_priv');
  }
  // Categories holding answers are on the page already — nothing to navigate.
  const aboutRestored = editor.locator('.category-card', { hasText: 'About me' });
  await aboutRestored.waitFor();
  const restored = await aboutRestored
    .locator('.q-row', { hasText: 'Pronouns' })
    .locator('.opt[aria-pressed="true"]')
    .allTextContents();
  if (!restored.some((t) => t.includes('they/them'))) {
    fail('open answers not restored on login: ' + restored.join(','));
  }
  // Weights round-trip through blob_priv too — the dealbreaker survives login.
  // The row's marker carries the mark, so this reads it without opening the
  // control. Look, don't save: a save here would bump the CAS version under
  // profile A's original tab.
  const markTitle = await editor
    .locator('.category-card', { hasText: 'Everyday life' })
    .locator('.q-row', { hasText: 'Alcohol' })
    .locator('.q-mark')
    .getAttribute('title');
  if (markTitle !== 'Importance: Dealbreaker') {
    fail('dealbreaker weight not restored on login: ' + markTitle);
  }
  const desiresCard = await editor.textContent('.category-card:has-text("Desires") .category-head');
  if (!desiresCard.includes('2 / ')) fail('desires answers not restored on login: ' + desiresCard);

  // --- compare by phrases: mutual desires reveal, one-sided stay hidden -----
  step = 'compare';
  await page.goto(`${BASE}#/compare`);
  await page.waitForSelector('text=＋ My profile');
  await page.click('text=＋ My profile');
  await page.fill('input[aria-label="Paste a view phrase or link"]', viewPhraseB);
  await page.click('form button:has-text("Add")');
  await page.waitForSelector('text=Overall alignment', { timeout: 30000 });
  const compareBody = await page.textContent('body');
  for (const needle of [
    personaName,
    personaNameB,
    'Friendship',
    'Desires — mutual only',
    'Rope',
    'shared answers',
    'Values fingerprint',
    `Fit for ${personaName}`,
    'marked it a dealbreaker', // A's alcohol dealbreaker vs B's "Socially"
    'Care interlock',
    'unmet', // flow diagram: A leaves B's "Acts" need dangling
    'Agreement, item by item',
    'Fit, each way',
  ]) {
    if (!compareBody.includes(needle)) fail('compare missing: ' + needle);
  }
  if (compareBody.includes('Impact play')) fail('one-sided desire leaked in compare');
  await shot(page, '06-compare.png');

  // --- groups: create, join both tiers, compare, kick, re-mint --------------
  step = 'group-create';
  await page.goto(`${BASE}#/groups`);
  await page.waitForSelector('text=My groups');
  await page.click('text=🐣 Create a group');
  await page.waitForSelector('text=Your group is hatched', { timeout: 60000 });
  const groupAdminPhrase = (await page.textContent('.notice .passphrase-box')).trim();
  if (groupAdminPhrase.split(' ').length !== 5) fail('group admin phrase not 5 words');
  await page.locator('.grid-row a', { hasText: 'Open' }).first().click();
  // Gate on something unique to a LOADED group page — the dashboard's groups
  // blurb also contains the word "Members", so that alone can win a race
  // against the SPA navigation and capture the wrong page's code-box.
  await page.waitForSelector('text=📋 Copy invite link', { timeout: 45000 });
  const groupPhrase = (await page.textContent('.code-box')).trim();
  if (!/^[a-z]+(-[a-z]+){5}$/.test(groupPhrase)) fail(`group phrase malformed: "${groupPhrase}"`);

  step = 'group-join-open';
  await page.click('text=🦊 Join openly'); // A deposits with creature + view link
  await page.waitForSelector('text=(you)', { timeout: 60000 });

  step = 'group-join-pseudonym';
  await pageB.goto(`${BASE}#/group/${groupPhrase}`);
  await pageB.waitForSelector('text=📋 Copy invite link', { timeout: 45000 });
  await pageB.click('text=🐾 Join with a pseudonym');
  await pageB.waitForSelector('text=(you)', { timeout: 60000 });
  await pageB.waitForSelector('text=Members (2)', { timeout: 15000 });

  step = 'group-roster';
  await page.reload();
  await page.waitForSelector('text=Members (2)', { timeout: 45000 });
  const rosterA = await page.textContent('body');
  if (rosterA.includes(personaNameB)) fail('pseudonymous deposit leaked the creature');
  if (!rosterA.includes('% overall match with you')) fail('group match % missing');
  if (!rosterA.includes('pseudonym')) fail('pseudonym badge missing');

  // B opens up — the creature appears for everyone.
  await pageB.click('text=Open up — share my creature');
  await pageB.waitForSelector(`text=${personaNameB}`, { timeout: 60000 });
  await page.reload();
  await page.waitForSelector(`text=${personaNameB}`, { timeout: 45000 });

  step = 'group-compare';
  await page.locator('input[type="checkbox"][aria-label^="Select"]').first().check();
  await page.click('button:has-text("Compare")');
  await page.waitForSelector('text=Overall alignment', { timeout: 45000 });
  if (!(await page.textContent('body')).includes(personaNameB)) {
    fail('group compare missing the selected member');
  }

  step = 'group-kick';
  await page.goto(`${BASE}#/group/${groupPhrase}`);
  await page.waitForSelector('text=Members (2)', { timeout: 45000 });
  await page.locator('button', { hasText: '✕ Kick' }).first().click(); // confirm auto-accepted
  await page.waitForSelector('text=Members (1)', { timeout: 45000 });

  step = 'group-remint';
  await page.click('text=🎲 Re-mint group');
  await page.waitForFunction(
    (old) => document.querySelector('.code-box')?.textContent?.trim() !== old,
    groupPhrase,
    { timeout: 90000 },
  );
  const groupPhrase2 = (await page.textContent('.code-box')).trim();
  await page.waitForSelector('text=Members (1)', { timeout: 45000 }); // A auto re-deposited
  const deadGroup = await freshPage();
  await deadGroup.goto(`${BASE}#/group/${groupPhrase}`);
  await deadGroup.waitForSelector('text=Couldn’t open that group', { timeout: 30000 });

  // --- boops: sealed first contact, one reply, rotation closes the door -----
  step = 'boop-send';
  await pageB.goto(viewUrl); // B on A's profile
  await pageB.waitForSelector(`text=${personaName}`, { timeout: 30000 });
  await pageB.click('text=👉 Boop');
  await pageB.waitForSelector('text=What are you hoping for?', { timeout: 30000 });
  await pageB.locator('.boop-check', { hasText: 'Curious to connect' }).locator('input').check();
  await pageB
    .locator('.boop-check', { hasText: 'Include a contact card' })
    .locator('input')
    .check();
  await pageB.waitForSelector('text=leaves Menagerie’s protection');
  await pageB.fill('input[placeholder="your handle"]', 'amber.fox.77');
  await pageB
    .locator('.boop-check', { hasText: 'I understand this de-anonymizes me' })
    .locator('input')
    .check();
  await pageB.click('text=Send boop');
  await pageB.waitForSelector('text=Booped!', { timeout: 30000 });
  // Mid-flight at-rest check: the knock sits on the server RIGHT NOW, and the
  // handle and intent text must already be unreadable in the raw DB.
  {
    const liveBytes = rawDbBytes(dbPath);
    if (liveBytes.includes('amber.fox.77')) fail('contact handle readable at rest');
    if (liveBytes.includes('Curious to connect')) fail('boop intent readable at rest');
  }

  step = 'boop-receive';
  await page.goto(`${BASE}#/menagerie`); // the shell polls; this page shows them
  await page.waitForSelector(`text=says it’s from`, { timeout: 30000 });
  const boopRow = await page.textContent('body');
  if (!boopRow.includes(personaNameB)) fail('boop does not show the claimed sender creature');
  if (boopRow.includes('amber.fox.77')) fail('contact handle shown without the reveal tap');
  await page.click('text=Reveal contact card');
  await page.waitForSelector('text=amber.fox.77', { timeout: 30000 });
  if (!(await page.textContent('body')).includes('Signal')) {
    fail('contact platform label missing after reveal');
  }

  step = 'boop-reply';
  await page.click('text=↩️ Reply once');
  await page.waitForSelector('text=One reply, then the channel closes', { timeout: 30000 });
  await page.locator('.boop-check', { hasText: 'We seem compatible' }).locator('input').check();
  await page.locator('.boop-check', { hasText: 'Include my view phrase' }).locator('input').check();
  await page.click('text=Send reply');
  await page.waitForSelector('text=Reply sent', { timeout: 30000 });

  step = 'boop-answer';
  await pageB.goto(`${BASE}#/menagerie`);
  await pageB.waitForSelector('text=↩️ replied', { timeout: 30000 });
  const answerBody = await pageB.textContent('body');
  if (!answerBody.includes('We seem compatible')) fail('reply intents missing');
  if (!(await pageB.locator('a', { hasText: 'Their profile' }).count())) {
    fail('reply view-phrase attachment missing');
  }
  // --- freshness: B keeps A, A answers something, B is told ----------------
  // The whole point of keeping a creature: noticing it changed without having
  // to ask its owner out of band.
  step = 'menagerie-keep';
  await pageB.goto(viewUrl);
  await pageB.waitForSelector(`text=${personaName}`, { timeout: 30000 });
  await pageB.click('text=💾 Add to my menagerie');
  await pageB.waitForSelector('text=joined your menagerie', { timeout: 30000 });
  await pageB.goto(`${BASE}#/menagerie`);
  await pageB.waitForSelector(`text=${personaName}`, { timeout: 60000 });
  await pageB.waitForSelector('text=Check for updates', { timeout: 60000 });
  if ((await pageB.textContent('body')).includes('new answers')) {
    fail('a creature kept a moment ago is reported as having new answers');
  }

  step = 'menagerie-updated';
  await page.goto(`${BASE}#/me`);
  await page.waitForSelector('.profile-head');
  await editCategory(page, 'What I value', async (card) => {
    await card.locator('.q-row', { hasText: 'Togetherness' }).locator('.pip-scale').nth(5).click();
  });
  // reload(), not goto(): B is already on this URL and the browser treats a
  // same-fragment goto as nothing at all. Reloading also proves the point —
  // the baseline came back from the server, not from a signal still in memory.
  // Two waits, because the page has to finish an Argon2id session restore
  // before the refresh it kicks off can say anything.
  await pageB.reload();
  await pageB.waitForSelector(`text=${personaName}`, { timeout: 60000 });
  await pageB.waitForSelector('text=new answers', { timeout: 60000 });

  step = 'menagerie-seen';
  // Reading the profile is what clears it — and it stays cleared across a
  // reload, which is the part that only works because the baseline reached
  // the server. Wait for the page to stop talking before reloading, or the
  // reload races the very write being asserted.
  // Wait for the write itself, not for the network to look quiet: a service
  // worker serves cached assets without touching the network, so "networkidle"
  // can arrive before the PUT that persists the baseline has even been sent.
  const seenPersisted = pageB.waitForResponse(
    (res) => res.request().method() === 'PUT' && res.url().includes('/v2/profiles/edit/'),
    { timeout: 60000 },
  );
  await pageB.click('a:has-text("View")');
  await pageB.waitForSelector(`text=${personaName}`, { timeout: 60000 });
  await seenPersisted;
  await pageB.goto(`${BASE}#/menagerie`);
  await pageB.reload();
  await pageB.waitForSelector(`text=${personaName}`, { timeout: 60000 });
  await pageB.waitForSelector('text=Check for updates', { timeout: 60000 });
  if ((await pageB.textContent('body')).includes('new answers')) {
    fail('the badge came back after the profile was looked at');
  }

  // Park B on A's (still-current) profile page: after A regenerates, this
  // stale page's boop attempt must be turned away.
  await pageB.goto(viewUrl);
  await pageB.waitForSelector(`text=${personaName}`, { timeout: 30000 });

  // --- regenerate: new creature, old links and QRs die ----------------------
  step = 'regenerate';
  await page.goto(`${BASE}#/me`);
  await page.waitForSelector('.profile-head');
  await page.click('text=New creature'); // confirm dialog auto-accepted
  await page.waitForFunction(
    (old) => document.querySelector('.code-box')?.textContent?.trim() !== old,
    viewPhrase,
    { timeout: 30000 },
  );
  const viewPhrase2 = (await page.textContent('.code-box')).trim();
  const personaName2 = (await page.textContent('.persona-name')).trim();
  if (personaName2 === personaName) fail('creature did not change');
  if (personaName2 !== viewPhrase2.split('-').slice(0, 3).join('-')) {
    fail('new persona is not the new phrase head');
  }
  if ((await decodeQr(page, `${BASE}#/view/${viewPhrase2}`)) === null) {
    fail('post-regenerate QR did not decode to the new view URL');
  }
  const deadViewer = await freshPage();
  await deadViewer.goto(viewUrl); // the OLD url
  await deadViewer.waitForSelector('text=Couldn’t open that profile', { timeout: 30000 });
  const newViewer = await freshPage();
  await newViewer.goto(`${BASE}#/view/${viewPhrase2}`);
  await newViewer.waitForSelector(`text=${personaName2}`, { timeout: 30000 });

  // Rotation closed the boop address: B's stale copy of A's profile still
  // shows the button, but the send must come back "no longer accepting".
  step = 'boop-after-regenerate';
  await pageB.click('text=👉 Boop');
  await pageB.waitForSelector('text=What are you hoping for?', { timeout: 30000 });
  await pageB.locator('.boop-check', { hasText: 'Curious to connect' }).locator('input').check();
  await pageB.click('text=Send boop');
  await pageB.waitForSelector('text=no longer accepting boops', { timeout: 30000 });

  // --- garbage collection: empty profiles die, populated ones live ----------
  step = 'gc';
  const gcEmpty = await hatchProfile(gc.url);
  const gcEmptyPhrase = (await gcEmpty.textContent('.code-box')).trim();
  const gcAlive = await hatchProfile(gc.url);
  const gcAlivePhrase = (await gcAlive.textContent('.code-box')).trim();
  const gcAlivePersona = (await gcAlive.textContent('.persona-name')).trim();
  await editCategory(gcAlive, 'About me', async (card) => {
    await card
      .locator('.q-row', { hasText: 'Age range' })
      .locator('.opt', { hasText: '35–44' })
      .click();
  });
  // Age both profiles by two hours (past the 3s TTL + 1h coarseness slack).
  // The empty one becomes GC-eligible; the populated one is immune to the
  // empty rule and far from idle.
  {
    const { DatabaseSync } = await import('node:sqlite');
    const raw = new DatabaseSync(gcDbPath);
    raw.prepare('UPDATE profiles SET created_at = ?').run(Date.now() - 2 * 3600 * 1000);
    raw.close();
  }
  await new Promise((r) => setTimeout(r, 3000)); // a few sweep intervals
  const gcViewer = await freshPage(gc.url);
  await gcViewer.goto(`${BASE}#/view/${gcEmptyPhrase}`);
  await gcViewer.waitForSelector('text=Couldn’t open that profile', { timeout: 30000 });
  await gcViewer.goto(`${BASE}#/view/${gcAlivePhrase}`);
  await gcViewer.waitForSelector(`text=${gcAlivePersona}`, { timeout: 30000 });

  // --- anonymous metrics: opt-in submit, k-floor, community page ------------
  step = 'metrics';
  const mPage = await hatchProfile(metricsSrv.url);
  await editCategory(mPage, 'About me', async (card) => {
    await card
      .locator('.q-row', { hasText: 'Age range' })
      .locator('.opt', { hasText: '25–34' })
      .click();
  });
  await editCategory(mPage, 'Connections I’m open to', async (card) => {
    await card
      .locator('.q-row', { hasText: 'Friendship' })
      .first()
      .locator('.pip', { hasText: 'Into it' })
      .click();
  });
  // The opt-in moved to /settings with the rest of the set-once controls.
  await mPage.goto(`${BASE}#/settings`);
  await mPage.waitForSelector('text=Contribute anonymously');
  await mPage.locator('label:has-text("Count my answers") input').check();
  await mPage.waitForSelector('text=Counted — thank you', { timeout: 60000 });

  const epochNow = new Date().toISOString().slice(0, 7);
  const agg = await (await fetch(`${metricsSrv.url}/v2/metrics/${epochNow}`)).json();
  if ((agg.buckets['age|1'] ?? 0) < 1) fail('age bucket missing from aggregate');
  if ((agg.buckets['1|sk.friend|1'] ?? 0) < 1) fail('joint bucket missing');
  if (!agg.buckets['1|sk.friend|_n']) fail('denominator bucket missing');
  for (const bucket of Object.keys(agg.buckets)) {
    if (!/^[a-z0-9._|-]{1,80}$/.test(bucket)) fail(`malformed bucket served: ${bucket}`);
  }

  // Opting out stops submissions; opting back in duplicates harmlessly (409).
  await mPage.locator('label:has-text("Count my answers") input').uncheck();
  await mPage.waitForSelector('text=Opted out', { timeout: 45000 });
  await mPage.locator('label:has-text("Count my answers") input').check();
  await mPage.waitForSelector('text=Counted — thank you', { timeout: 60000 });

  await mPage.goto(`${BASE}#/community`);
  await mPage.waitForSelector('text=Age bands', { timeout: 30000 });
  if (!(await mPage.textContent('body')).includes('25–34')) {
    fail('community page missing the age band');
  }

  // --- dark + mobile ---------------------------------------------------------
  step = 'dark';
  const dark = await freshPage(main.url, { colorScheme: 'dark' });
  await dark.goto(`${BASE}#/view/${viewPhrase2}`);
  await dark.waitForSelector(`text=${personaName2}`, { timeout: 30000 });
  await shot(dark, '07-view-dark.png');

  step = 'mobile';
  const mobile = await freshPage(main.url, { viewport: { width: 390, height: 844 } });
  await mobile.waitForSelector('text=Hatch a profile');
  await shot(mobile, '08-mobile-landing.png');

  // --- zero knowledge at rest: raw server DB holds no plaintext --------------
  step = 'zero-knowledge-at-rest';
  main.proc.kill('SIGTERM'); // clean close checkpoints WAL into the main file
  await new Promise((resolve) => main.proc.on('exit', resolve));
  const dbBytes = rawDbBytes(dbPath);
  // Markers are chosen so base64url ciphertext can't contain them by chance:
  // multi-word phrases with spaces/hyphens, quoted JSON keys, dotted item ids.
  for (const marker of [
    editPhrase,
    viewPhrase,
    viewPhrase2,
    groupPhrase,
    groupPhrase2,
    groupAdminPhrase,
    '"answers"',
    '"viewPhrase"',
    '"connections"',
    '"weights"',
    '"pseudonym"',
    '"snapshot"',
    'dp.rope',
    '"a":',
    'amber.fox.77',
    '"sentBoops"',
    '"replyBox"',
    'Curious to connect',
  ]) {
    if (dbBytes.includes(marker)) fail(`plaintext ${JSON.stringify(marker)} at rest`);
  }

  if (errors.length) fail('page errors: ' + errors.join(' | '));
  console.log('E2E PASS');
} catch (err) {
  console.error(`E2E FAIL: [${step}]`, err.message);
  if (errors.length) console.error('page errors so far:', errors.join(' | '));
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      const text = await p.evaluate(() => document.body.innerText.slice(0, 3000)).catch(() => '?');
      console.error(`--- open page ${p.url()}\n${text}`);
    }
  }
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
  if (!main.proc.killed) main.proc.kill('SIGKILL');
  gc.proc.kill('SIGKILL');
  metricsSrv.proc.kill('SIGKILL');
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(dbPath + suffix, { force: true });
    rmSync(gcDbPath + suffix, { force: true });
    rmSync(metricsDbPath + suffix, { force: true });
  }
}
