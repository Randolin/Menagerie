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
import {
  createReadStream, existsSync, statSync, readFileSync, mkdirSync, rmSync,
} from 'node:fs';
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
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.ico': 'image/x-icon', '.json': 'application/json',
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
    } catch { /* not up yet */ }
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
const fail = (msg) => { throw new Error(`[${step}] ${msg}`); };

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
    await page.locator('.qr-svg svg').evaluate((el) => {
      el.style.width = '640px';
      el.style.height = '640px';
    });
    const png = PNG.sync.read(await page.locator('.qr-svg svg').screenshot());
    const hit = jsQR(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
      png.width,
      png.height,
    );
    await page.locator('.qr-svg svg').evaluate((el) => {
      el.style.width = '';
      el.style.height = '';
    }).catch(() => {});
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

/** Section review cards live behind the dashboard's details toggle. */
async function openSectionList(page) {
  const details = page.locator('details:has-text("Review all answers")');
  if ((await details.getAttribute('open')) === null) {
    await details.locator('summary').click();
  }
}

/** Open a section review form from the dashboard, run `edit`, save, return. */
async function editSection(page, sectionTitle, edit) {
  await openSectionList(page);
  await page.locator('details .section-card', { hasText: sectionTitle }).click();
  await page.waitForSelector('.item-block, .optin-gate');
  await edit();
  await page.click('text=💾 Save');
  // Generous: the sandbox CPU is shared with two spawned servers, and other
  // contexts may be mid-Argon2id (64 MiB × 3 passes) at the same time.
  await page.waitForSelector('.section-grid', { timeout: 45000 });
}

/**
 * Run the first three cards of the "Inner compass" pack (values scales, tick
 * 3/6 each) through the one-card-at-a-time stream, then save. Single-tap
 * answers auto-advance, so each next card is awaited by its right anchor.
 */
async function runCompassPack(page) {
  await page.locator('.section-card', { hasText: 'Inner compass' }).click();
  await page.waitForSelector('.pack-stage .item-block', { timeout: 15000 });
  for (const anchor of ['Togetherness', 'Novelty & adventure', 'Heart decides']) {
    await page.waitForSelector(`.pack-stage:has-text("${anchor}")`);
    await page.locator('.pack-stage .scale-tick', { hasText: '3' }).click();
  }
  await page.waitForSelector('.pack-stage:has-text("Spender")', { timeout: 5000 });
  await page.click('text=💾 Save & exit');
  await page.waitForSelector('.section-grid', { timeout: 45000 });
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

  step = 'landing-configure';
  await page.fill('input[aria-label="Profile server URL"]', main.url);
  await page.click('text=Use this server');
  await page.waitForSelector('button:has-text("Hatch a profile"):not([disabled])');
  await shot(page, '02-landing.png');

  // --- hatch: profile, QR, and both phrases exist before any answer --------
  step = 'hatch';
  await page.click('text=Hatch a profile');
  await page.waitForSelector('.passphrase-box', { timeout: 30000 });
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

  // --- notice dismissal sticks per device -----------------------------------
  step = 'notice-dismiss';
  await page.click('text=I’ve saved it');
  await page.waitForSelector('.passphrase-box', { state: 'detached' });
  await page.reload(); // session survives via sessionStorage (guard re-derives keys)
  await page.waitForSelector('.section-grid', { timeout: 45000 });
  if (await page.locator('.passphrase-box').count()) fail('notice reappeared after dismissal');

  // --- hub-and-spoke section editing with explicit saves --------------------
  step = 'sections';
  await editSection(page, 'About me', async () => {
    await page.locator('.item-block', { hasText: 'Pronouns' })
      .locator('.opt', { hasText: 'they/them' }).click();
    await page.locator('.item-block', { hasText: 'Age range' })
      .locator('.opt', { hasText: '25–34' }).click();
  });
  await editSection(page, 'Connections I’m open to', async () => {
    await page.locator('.item-block', { hasText: 'Friendship' }).first()
      .locator('.opt', { hasText: 'Into it' }).click();
    await page.locator('.item-block', { hasText: 'Polyamory' })
      .locator('.opt', { hasText: 'Curious' }).click();
  });
  // Care given vs received — feeds the interlock flow diagram.
  await editSection(page, 'How I connect', async () => {
    const give = page.locator('.item-block', { hasText: 'How I naturally show care' });
    await give.locator('.opt', { hasText: 'Physical touch' }).click();
    await give.locator('.opt', { hasText: 'Quality time' }).click();
    await page.locator('.item-block', { hasText: 'How care lands best for me' })
      .locator('.opt', { hasText: 'Words & affirmation' }).click();
  });
  // A dealbreaker: only "Never"/"Rarely" drinkers need apply.
  await editSection(page, 'Everyday life', async () => {
    const alcohol = page.locator('.item-block', { hasText: 'Alcohol' });
    await alcohol.locator('.opt-grid .opt', { hasText: 'Never' }).click();
    await alcohol.locator('button', { hasText: 'Dealbreaker' }).click();
    await alcohol.locator('.weight-accept .opt', { hasText: 'Never' }).click();
    await alcohol.locator('.weight-accept .opt', { hasText: 'Rarely' }).click();
  });
  await editSection(page, 'Desires & play', async () => {
    await page.click('text=Open this section');
    await page.waitForSelector('text=Rope');
    await page.locator('.item-block', { hasText: 'Rope' }).first()
      .locator('.opt', { hasText: 'Into it' }).click();
    await page.locator('.item-block', { hasText: 'Impact play' })
      .locator('.opt', { hasText: 'Into it' }).click(); // one-sided vs B
  });
  await openSectionList(page);
  const aboutCard = await page.textContent('details .section-card:has-text("About me")');
  if (!aboutCard.includes('2 of')) fail('section completion count not updated: ' + aboutCard);

  // --- the card stream: three values answered one card at a time ------------
  step = 'pack-runner';
  await runCompassPack(page);
  await shot(page, '04-dashboard-filled.png');

  // --- a second profile to compare against ----------------------------------
  step = 'profile-b';
  const pageB = await freshPage();
  await pageB.click('text=Hatch a profile');
  await pageB.waitForSelector('.passphrase-box', { timeout: 30000 });
  const viewPhraseB = (await pageB.textContent('.code-box')).trim();
  const personaNameB = (await pageB.textContent('.persona-name')).trim();
  await editSection(pageB, 'Connections I’m open to', async () => {
    await pageB.locator('.item-block', { hasText: 'Friendship' }).first()
      .locator('.opt', { hasText: 'Into it' }).click();
  });
  // B gives words (covers A's need); B needs acts (A leaves it unmet).
  await editSection(pageB, 'How I connect', async () => {
    await pageB.locator('.item-block', { hasText: 'How I naturally show care' })
      .locator('.opt', { hasText: 'Words & affirmation' }).click();
    await pageB.locator('.item-block', { hasText: 'How care lands best for me' })
      .locator('.opt', { hasText: 'Acts of service' }).click();
  });
  // B drinks socially — a near-miss by ordinal distance, but outside A's
  // dealbreaker set, so only A's directional fit takes the hit.
  await editSection(pageB, 'Everyday life', async () => {
    await pageB.locator('.item-block', { hasText: 'Alcohol' })
      .locator('.opt-grid .opt', { hasText: 'Socially' }).click();
  });
  await editSection(pageB, 'Desires & play', async () => {
    await pageB.click('text=Open this section');
    await pageB.waitForSelector('text=Rope');
    await pageB.locator('.item-block', { hasText: 'Rope' }).first()
      .locator('.opt', { hasText: 'Curious' }).click();
  });
  await runCompassPack(pageB);

  // --- the QR bypass: a fresh device opens the view URL directly ------------
  step = 'view-fresh-context';
  const viewer = await freshPage();
  await viewer.goto(viewUrl);
  // The creature IS the display name — no nickname exists anywhere.
  await viewer.waitForSelector(`text=${personaName}’s profile`, { timeout: 30000 });
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
  await editor.fill('input[aria-label="Edit phrase"]', editPhrase);
  await editor.click('text=Open my profile');
  await editor.waitForSelector('.section-grid', { timeout: 30000 });
  // The edit-phrase notice reappears on a new device — that's the feature.
  if (!(await editor.locator('.passphrase-box').count())) {
    fail('edit-phrase notice missing on a new device');
  }
  if ((await editor.textContent('.code-box')).trim() !== viewPhrase) {
    fail('view phrase not recovered from blob_priv');
  }
  await openSectionList(editor);
  await editor.locator('details .section-card', { hasText: 'About me' }).click();
  await editor.waitForSelector('.item-block');
  const restored = await editor.locator('.item-block', { hasText: 'Pronouns' })
    .locator('.opt[aria-pressed="true"]').allTextContents();
  if (!restored.some((t) => t.includes('they/them'))) {
    fail('open answers not restored on login: ' + restored.join(','));
  }
  await editor.goto(`${BASE}#/me`);
  await editor.waitForSelector('.section-grid');
  // Weights round-trip through blob_priv too — the dealbreaker survives
  // login. Look, don't save: a save here would bump the CAS version under
  // profile A's original tab.
  await openSectionList(editor);
  await editor.locator('details .section-card', { hasText: 'Everyday life' }).click();
  await editor.waitForSelector('.item-block');
  const marked = await editor.locator('.item-block', { hasText: 'Alcohol' })
    .locator('.weight-on', { hasText: 'Dealbreaker' }).count();
  if (!marked) fail('dealbreaker weight not restored on login');
  await editor.goto(`${BASE}#/me`);
  await editor.waitForSelector('.section-grid');
  await openSectionList(editor);
  const desiresCard = await editor.textContent('details .section-card:has-text("Desires")');
  if (!desiresCard.includes('2 of')) fail('desires answers not restored on login: ' + desiresCard);

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
    personaName, personaNameB, 'Friendship', 'Desires — mutual only', 'Rope',
    'shared answers', 'Values fingerprint', `Fit for ${personaName}`,
    'marked it a dealbreaker', // A's alcohol dealbreaker vs B's "Socially"
    'Care interlock', 'unmet', // flow diagram: A leaves B's "Acts" need dangling
    'Agreement, item by item', 'Fit, each way',
  ]) {
    if (!compareBody.includes(needle)) fail('compare missing: ' + needle);
  }
  if (compareBody.includes('Impact play')) fail('one-sided desire leaked in compare');
  await shot(page, '06-compare.png');

  // --- groups: create, join both tiers, compare, kick, re-mint --------------
  step = 'group-create';
  await page.goto(`${BASE}#/me`);
  await page.waitForSelector('.section-grid');
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
  if ((await pageB.textContent('body')).includes('Members (2)') === false) {
    await pageB.waitForSelector('text=Members (2)', { timeout: 15000 });
  }

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
  await pageB.waitForSelector(`text=${personaName}’s profile`, { timeout: 30000 });
  await pageB.click('text=👉 Boop');
  await pageB.waitForSelector('text=What are you hoping for?', { timeout: 30000 });
  await pageB.locator('.boop-check', { hasText: 'Curious to connect' })
    .locator('input').check();
  await pageB.locator('.boop-check', { hasText: 'Include a contact card' })
    .locator('input').check();
  await pageB.waitForSelector('text=leaves Menagerie’s protection');
  await pageB.fill('input[placeholder="your handle"]', 'amber.fox.77');
  await pageB.locator('.boop-check', { hasText: 'I understand this de-anonymizes me' })
    .locator('input').check();
  await pageB.click('text=Send boop');
  await pageB.waitForSelector('text=Booped!', { timeout: 30000 });
  // Mid-flight at-rest check: the knock sits on the server RIGHT NOW, and the
  // handle and intent text must already be unreadable in the raw DB.
  {
    let liveBytes = '';
    for (const suffix of ['', '-wal', '-shm']) {
      const f = dbPath + suffix;
      if (existsSync(f)) liveBytes += readFileSync(f, 'latin1');
    }
    if (liveBytes.includes('amber.fox.77')) fail('contact handle readable at rest');
    if (liveBytes.includes('Curious to connect')) fail('boop intent readable at rest');
  }

  step = 'boop-receive';
  await page.goto(`${BASE}#/me`); // A's dashboard polls on load
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
  await page.locator('.boop-check', { hasText: 'We seem compatible' })
    .locator('input').check();
  await page.locator('.boop-check', { hasText: 'Include my view phrase' })
    .locator('input').check();
  await page.click('text=Send reply');
  await page.waitForSelector('text=Reply sent', { timeout: 30000 });

  step = 'boop-answer';
  await pageB.goto(`${BASE}#/me`);
  await pageB.waitForSelector('text=↩️ replied', { timeout: 30000 });
  const answerBody = await pageB.textContent('body');
  if (!answerBody.includes('We seem compatible')) fail('reply intents missing');
  if (!(await pageB.locator('a', { hasText: 'Their profile' }).count())) {
    fail('reply view-phrase attachment missing');
  }
  // Park B on A's (still-current) profile page: after A regenerates, this
  // stale page's boop attempt must be turned away.
  await pageB.goto(viewUrl);
  await pageB.waitForSelector(`text=${personaName}’s profile`, { timeout: 30000 });

  // --- regenerate: new creature, old links and QRs die ----------------------
  step = 'regenerate';
  await page.goto(`${BASE}#/me`);
  await page.waitForSelector('.section-grid');
  await page.click('text=🎲 New creature'); // confirm dialog auto-accepted
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
  await newViewer.waitForSelector(`text=${personaName2}’s profile`, { timeout: 30000 });

  // Rotation closed the boop address: B's stale copy of A's profile still
  // shows the button, but the send must come back "no longer accepting".
  step = 'boop-after-regenerate';
  await pageB.click('text=👉 Boop');
  await pageB.waitForSelector('text=What are you hoping for?', { timeout: 30000 });
  await pageB.locator('.boop-check', { hasText: 'Curious to connect' })
    .locator('input').check();
  await pageB.click('text=Send boop');
  await pageB.waitForSelector('text=no longer accepting boops', { timeout: 30000 });

  // --- garbage collection: empty profiles die, populated ones live ----------
  step = 'gc';
  const gcEmpty = await freshPage(gc.url);
  await gcEmpty.click('text=Hatch a profile');
  await gcEmpty.waitForSelector('.passphrase-box', { timeout: 30000 });
  const gcEmptyPhrase = (await gcEmpty.textContent('.code-box')).trim();
  const gcAlive = await freshPage(gc.url);
  await gcAlive.click('text=Hatch a profile');
  await gcAlive.waitForSelector('.passphrase-box', { timeout: 30000 });
  const gcAlivePhrase = (await gcAlive.textContent('.code-box')).trim();
  const gcAlivePersona = (await gcAlive.textContent('.persona-name')).trim();
  await editSection(gcAlive, 'About me', async () => {
    await gcAlive.locator('.item-block', { hasText: 'Age range' })
      .locator('.opt', { hasText: '35–44' }).click();
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
  await gcViewer.waitForSelector(`text=${gcAlivePersona}’s profile`, { timeout: 30000 });

  // --- anonymous metrics: opt-in submit, k-floor, community page ------------
  step = 'metrics';
  const mPage = await freshPage(metricsSrv.url);
  await mPage.click('text=Hatch a profile');
  await mPage.waitForSelector('.passphrase-box', { timeout: 30000 });
  await editSection(mPage, 'About me', async () => {
    await mPage.locator('.item-block', { hasText: 'Age range' })
      .locator('.opt', { hasText: '25–34' }).click();
  });
  await editSection(mPage, 'Connections I’m open to', async () => {
    await mPage.locator('.item-block', { hasText: 'Friendship' }).first()
      .locator('.opt', { hasText: 'Into it' }).click();
  });
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
  await dark.waitForSelector(`text=${personaName2}’s profile`, { timeout: 30000 });
  await shot(dark, '07-view-dark.png');

  step = 'mobile';
  const mobile = await freshPage(main.url, { viewport: { width: 390, height: 844 } });
  await mobile.waitForSelector('text=Hatch a profile');
  await shot(mobile, '08-mobile-landing.png');

  // --- zero knowledge at rest: raw server DB holds no plaintext --------------
  step = 'zero-knowledge-at-rest';
  main.proc.kill('SIGTERM'); // clean close checkpoints WAL into the main file
  await new Promise((resolve) => main.proc.on('exit', resolve));
  let dbBytes = '';
  for (const suffix of ['', '-wal', '-shm']) {
    const f = dbPath + suffix;
    if (existsSync(f)) dbBytes += readFileSync(f, 'latin1');
  }
  // Markers are chosen so base64url ciphertext can't contain them by chance:
  // multi-word phrases with spaces/hyphens, quoted JSON keys, dotted item ids.
  for (const marker of [
    editPhrase, viewPhrase, viewPhrase2, groupPhrase, groupPhrase2, groupAdminPhrase,
    '"answers"', '"viewPhrase"', '"connections"', '"weights"', '"pseudonym"',
    '"snapshot"', 'dp.rope', '"a":',
    'amber.fox.77', '"sentBoops"', '"replyBox"', 'Curious to connect',
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
