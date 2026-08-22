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
const spawnMoxyServer = async (env) => {
  const proc = spawn(process.execPath, [join(root, 'server/moxy-sync-server.ts')], {
    env: { ...process.env, PORT: '0', ...env },
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

/** Open a section from the dashboard, run `edit`, save, wait for return. */
async function editSection(page, sectionTitle, edit) {
  await page.locator('.section-card', { hasText: sectionTitle }).click();
  await page.waitForSelector('.item-block, .optin-gate');
  await edit();
  await page.click('text=💾 Save');
  // Generous: the sandbox CPU is shared with two spawned servers, and other
  // contexts may be mid-PBKDF2 (300k rounds) at the same time.
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
    await page.fill('.item-block input[type="text"]', 'River');
  });
  await editSection(page, 'Connections I’m open to', async () => {
    await page.locator('.item-block', { hasText: 'Friendship' }).first()
      .locator('.opt', { hasText: 'Into it' }).click();
    await page.locator('.item-block', { hasText: 'Polyamory' })
      .locator('.opt', { hasText: 'Curious' }).click();
  });
  await editSection(page, 'Desires & play', async () => {
    await page.click('text=Open this section');
    await page.waitForSelector('text=Rope');
    await page.locator('.item-block', { hasText: 'Rope' }).first()
      .locator('.opt', { hasText: 'Into it' }).click();
    await page.locator('.item-block', { hasText: 'Impact play' })
      .locator('.opt', { hasText: 'Into it' }).click(); // one-sided vs Sam
  });
  const aboutCard = await page.textContent('.section-card:has-text("About me")');
  if (!aboutCard.includes('1 of')) fail('section completion count not updated: ' + aboutCard);
  await shot(page, '04-dashboard-filled.png');

  // --- a second profile to compare against ----------------------------------
  step = 'profile-b';
  const pageB = await freshPage();
  await pageB.click('text=Hatch a profile');
  await pageB.waitForSelector('.passphrase-box', { timeout: 30000 });
  const viewPhraseB = (await pageB.textContent('.code-box')).trim();
  await editSection(pageB, 'About me', async () => {
    await pageB.fill('.item-block input[type="text"]', 'Sam');
  });
  await editSection(pageB, 'Connections I’m open to', async () => {
    await pageB.locator('.item-block', { hasText: 'Friendship' }).first()
      .locator('.opt', { hasText: 'Into it' }).click();
  });
  await editSection(pageB, 'Desires & play', async () => {
    await pageB.click('text=Open this section');
    await pageB.waitForSelector('text=Rope');
    await pageB.locator('.item-block', { hasText: 'Rope' }).first()
      .locator('.opt', { hasText: 'Curious' }).click();
  });

  // --- the QR bypass: a fresh device opens the view URL directly ------------
  step = 'view-fresh-context';
  const viewer = await freshPage();
  await viewer.goto(viewUrl);
  await viewer.waitForSelector('text=River’s profile', { timeout: 30000 });
  const viewerBody = await viewer.textContent('body');
  if (!viewerBody.includes(personaName)) fail('persona chip missing on the view page');
  if (viewerBody.includes('Rope') || viewerBody.includes('Impact play')) {
    fail('desires leaked into the public view page');
  }
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
  await editor.locator('.section-card', { hasText: 'About me' }).click();
  await editor.waitForSelector('.item-block');
  if ((await editor.inputValue('.item-block input[type="text"]')) !== 'River') {
    fail('open answers not restored on login');
  }
  await editor.goto(`${BASE}#/me`);
  await editor.waitForSelector('.section-grid');
  const desiresCard = await editor.textContent('.section-card:has-text("Desires")');
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
  for (const needle of ['River', 'Sam', 'Friendship', 'Desires — mutual only', 'Rope']) {
    if (!compareBody.includes(needle)) fail('compare missing: ' + needle);
  }
  if (compareBody.includes('Impact play')) fail('one-sided desire leaked in compare');
  await shot(page, '06-compare.png');

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
  await newViewer.waitForSelector('text=River’s profile', { timeout: 30000 });

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
  await editSection(gcAlive, 'About me', async () => {
    await gcAlive.fill('.item-block input[type="text"]', 'Kai');
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
  await gcViewer.waitForSelector('text=Kai’s profile', { timeout: 30000 });

  // --- dark + mobile ---------------------------------------------------------
  step = 'dark';
  const dark = await freshPage(main.url, { colorScheme: 'dark' });
  await dark.goto(`${BASE}#/view/${viewPhrase2}`);
  await dark.waitForSelector('text=River’s profile', { timeout: 30000 });
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
  // multi-word strings with spaces/hyphens, quoted JSON keys, dotted item ids.
  for (const marker of [
    'River', 'Sam', editPhrase, viewPhrase, viewPhrase2,
    '"answers"', '"viewPhrase"', '"connections"', 'dp.rope', '"a":',
  ]) {
    if (dbBytes.includes(marker)) fail(`plaintext ${JSON.stringify(marker)} at rest`);
  }

  if (errors.length) fail('page errors: ' + errors.join(' | '));
  console.log('E2E PASS');
} catch (err) {
  console.error(`E2E FAIL: [${step}]`, err.message);
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      const text = await p.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => '?');
      console.error(`--- open page ${p.url()}\n${text}`);
    }
  }
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
  if (!main.proc.killed) main.proc.kill('SIGKILL');
  gc.proc.kill('SIGKILL');
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(dbPath + suffix, { force: true });
    rmSync(gcDbPath + suffix, { force: true });
  }
}
