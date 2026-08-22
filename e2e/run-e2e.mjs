// Moxy end-to-end suite. Serves the PRODUCTION build (dist/moxy/browser) with
// a plain static file server — proving the zero-server property — and drives
// the real UI in Chromium via playwright-core.
//
// Run: npm run build && npm run e2e
// Env: MOXY_E2E_SHOTS=dir to also capture screenshots.
import { chromium } from 'playwright-core';
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

const legacyProfile = JSON.parse(readFileSync(join(root, 'e2e/fixtures/legacy-profile.json'), 'utf8'));
const legacyCompare = JSON.parse(readFileSync(join(root, 'e2e/fixtures/legacy-compare.json'), 'utf8'));

// --- dumb static server (no rewrites: hash routing must need none) ---------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(DIST, path === '/' ? 'index.html' : path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// --- the sync server, on its own origin (CORS is genuinely exercised) ------
const syncDbPath = join(tmpdir(), `moxy-e2e-sync-${process.pid}.db`);
const syncProc = spawn(process.execPath, [join(root, 'server/moxy-sync-server.ts')], {
  env: { ...process.env, PORT: '0', MOXY_DB_PATH: syncDbPath },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const SYNC_URL = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('sync server did not start')), 15000);
  let buffer = '';
  syncProc.stdout.on('data', (chunk) => {
    buffer += String(chunk);
    const match = buffer.match(/\{"listening":(\d+)/);
    if (match) {
      clearTimeout(timer);
      resolve(`http://127.0.0.1:${match[1]}`);
    }
  });
  syncProc.on('exit', () => reject(new Error('sync server exited during startup')));
});
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${SYNC_URL}/v1/health`)).ok) break;
  } catch { /* not up yet */ }
  if (i > 50) throw new Error('sync server health never came up');
  await new Promise((r) => setTimeout(r, 100));
}

const browser = await chromium.launch({ executablePath: CHROMIUM });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let step = '';
const fail = (msg) => { throw new Error(`[${step}] ${msg}`); };
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name), fullPage: true }); };

try {
  // --- home ----------------------------------------------------------------
  step = 'home';
  await page.goto(BASE);
  await page.waitForSelector('.hero h1');
  await shot('01-home.png');

  // --- survey --------------------------------------------------------------
  step = 'survey';
  await page.click('a[href="#/survey"]');
  await page.waitForSelector('.survey-progress');
  await page.fill('.item-block input[type="text"]', 'River');
  await page.locator('.item-block', { hasText: 'Age range' }).locator('.opt', { hasText: '25–34' }).click();
  await page.click('text=Next →');

  await page.waitForSelector('text=Friendship');
  await page.locator('.item-block', { hasText: 'Friendship' }).first().locator('.opt', { hasText: 'Into it' }).click();
  await page.locator('.item-block', { hasText: 'Polyamory' }).locator('.opt', { hasText: 'Curious' }).click();
  await page.click('text=Next →');

  await page.waitForSelector('.scale-ticks');
  await page.locator('.scale-ticks').nth(0).locator('.scale-tick').nth(4).click();
  await page.locator('.scale-ticks').nth(1).locator('.scale-tick').nth(5).click();
  await shot('02-survey-values.png');
  await page.click('text=Next →');

  await page.waitForSelector('text=Alcohol');
  await page.locator('.item-block').nth(0).locator('.opt').nth(2).click();
  await page.click('text=Next →');
  await page.waitForSelector('text=Messaging tempo');
  await page.click('text=Next →');
  await page.waitForSelector('text=Structures that could work');
  await page.click('text=Next →');

  step = 'desires-gate';
  await page.waitForSelector('.optin-gate');
  await shot('03-desires-gate.png');
  await page.click('text=Open this section');
  await page.waitForSelector('text=Rope');
  await page.locator('.item-block', { hasText: 'Rope' }).first().locator('.opt', { hasText: 'Into it' }).click();
  await page.click('text=Next →');
  await page.waitForSelector('text=Must-haves');
  await page.click('text=Finish → get my link');

  // --- share ---------------------------------------------------------------
  step = 'share';
  await page.waitForSelector('.code-box');
  const url = await page.textContent('.code-box');
  if (!/#p=m1\./.test(url)) fail('share URL malformed: ' + url?.slice(0, 80));
  if ((await page.locator('.qr-box svg').count()) !== 1) fail('QR code missing');
  await shot('04-share.png');

  // Draft survives reload (autosave).
  step = 'draft-autosave';
  await page.reload();
  await page.waitForSelector('.code-box');

  // --- vault create from share page ---------------------------------------
  step = 'vault-create';
  await page.click('text=Generate my passphrase');
  await page.waitForSelector('.passphrase-box');
  const pass = (await page.textContent('.passphrase-box')).trim();
  if (pass.split(' ').length !== 5) fail('passphrase not 5 words: ' + pass);
  await page.click('text=I’ve saved it — create my vault');
  await page.waitForSelector('text=Your vault is unlocked');
  await shot('05-vault-save.png');

  // --- LEGACY LINK: profile ------------------------------------------------
  step = 'legacy-profile-link';
  await page.goto(BASE + '#p=' + legacyProfile.code);
  await page.waitForSelector('text=Alex’s profile');
  await shot('06-profile.png');
  await page.click('text=Save to vault'); // vault unlocked from previous step

  // --- compare via paste ---------------------------------------------------
  step = 'compare';
  await page.goto(BASE + '#/compare');
  await page.waitForSelector('input[placeholder*="Paste"]');
  for (const code of legacyCompare.codes) {
    await page.fill('input[placeholder*="Paste"]', code);
    await page.click('form button:has-text("Add")');
  }
  await page.waitForSelector('text=The headline');
  const bodyText = await page.textContent('body');
  for (const needle of ['Overall alignment', 'Mutual connection types', 'Values, side by side',
    'What each of you is open to', 'Desires — mutual only', 'Rope']) {
    if (!bodyText.includes(needle)) fail('compare missing: ' + needle);
  }
  // One-sided desires must never reach the DOM.
  for (const hidden of ['Impact play', 'Cuddling & non-sexual touch', 'Tantra']) {
    if (bodyText.includes(hidden)) fail('one-sided desire leaked: ' + hidden);
  }
  await shot('07-compare.png');

  // --- LEGACY LINK: compare ------------------------------------------------
  step = 'legacy-compare-link';
  await page.goto(BASE + '#c=' + legacyCompare.codes.join('~'));
  await page.waitForSelector('text=The headline');
  const mutual = legacyCompare.expectedMutualDesires.map((m) => m.itemId);
  if (mutual.includes('dp.rope') && !(await page.textContent('body')).includes('Rope')) {
    fail('legacy compare link lost the mutual reveal');
  }

  // --- vault lock / unlock round-trip -------------------------------------
  step = 'vault-roundtrip';
  await page.goto(BASE + '#/vault');
  await page.waitForSelector('text=My profiles');
  await page.click('text=🔒 Lock vault');
  await page.waitForSelector('text=New here?');
  await page.fill('input[aria-label="Vault passphrase"]', pass);
  await page.click('button:has-text("Unlock")');
  await page.waitForSelector('text=My profiles', { timeout: 20000 });
  const vaultText = await page.textContent('body');
  if (!vaultText.includes('River')) fail('saved profile missing after unlock');
  if (!vaultText.includes('Alex')) fail('saved connection missing after unlock');
  await shot('08-vault.png');

  // Reload → vault locks again (key in memory only).
  step = 'vault-locks-on-reload';
  await page.reload();
  await page.waitForSelector('text=New here?');

  // --- dark mode -----------------------------------------------------------
  step = 'dark';
  const dark = await browser.newContext({ viewport: { width: 1180, height: 900 }, colorScheme: 'dark' });
  const dpage = await dark.newPage();
  dpage.on('pageerror', (e) => errors.push(String(e)));
  await dpage.goto(BASE + '#c=' + legacyCompare.codes.join('~'));
  await dpage.waitForSelector('text=The headline');
  if (SHOTS) await dpage.screenshot({ path: join(SHOTS, '09-compare-dark.png'), fullPage: true });
  await dark.close();

  // --- mobile --------------------------------------------------------------
  step = 'mobile';
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mobile.newPage();
  mpage.on('pageerror', (e) => errors.push(String(e)));
  await mpage.goto(BASE + '#/survey');
  await mpage.waitForSelector('.survey-progress');
  if (SHOTS) await mpage.screenshot({ path: join(SHOTS, '10-mobile-survey.png') });
  await mobile.close();

  // --- about ---------------------------------------------------------------
  step = 'about';
  await page.goto(BASE + '#/about');
  await page.waitForSelector('text=honest limit');

  // ==========================================================================
  // SYNC: everything above ran with no server configured — local-only mode is
  // the regression baseline. Now the zero-knowledge sync flows.
  // ==========================================================================
  const waitSynced = async (p) =>
    p.waitForFunction(
      () => document.querySelector('[data-sync-status]')?.textContent?.includes('Synced'),
      { timeout: 20000 },
    );
  const setServerField = async (p, url) => {
    const field = p.locator('input[aria-label="Sync server address"]');
    await field.fill(url);
    await field.dispatchEvent('change');
  };

  // --- device A: fresh context, create vault, add data, enable sync --------
  step = 'sync-device-a-setup';
  const devA = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const pageA = await devA.newPage();
  pageA.on('pageerror', (e) => errors.push('A: ' + String(e)));
  pageA.on('dialog', (d) => d.accept());
  await pageA.goto(BASE + '#/vault');
  await pageA.click('text=Create a vault');
  await pageA.waitForSelector('.passphrase-box');
  const syncPass = (await pageA.textContent('.passphrase-box')).trim();
  await pageA.click('text=I’ve saved it — create vault');
  await pageA.waitForSelector('text=My profiles');
  await pageA.fill('input[aria-label="Connection name"]', 'Casey');
  await pageA.fill('input[aria-label="Connection profile link"]', legacyProfile.code);
  await pageA.click('text=Add connection');
  await pageA.waitForSelector('.vault-item-name:has-text("Casey")');

  step = 'sync-enable';
  await setServerField(pageA, SYNC_URL);
  await pageA.click('text=Enable sync');
  await waitSynced(pageA);

  // --- device B: empty context + same passphrase = login from a new device --
  step = 'sync-two-device-login';
  const devB = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const pageB = await devB.newPage();
  pageB.on('pageerror', (e) => errors.push('B: ' + String(e)));
  pageB.on('dialog', (d) => d.accept());
  await pageB.goto(BASE + '#/vault');
  await setServerField(pageB, SYNC_URL);
  await pageB.fill('input[aria-label="Vault passphrase"]', syncPass);
  await pageB.click('button:has-text("Unlock")');
  await pageB.waitForSelector('.vault-item-name:has-text("Casey")', { timeout: 20000 });

  // --- concurrent edits: A pushes first, stale B merges on 409 --------------
  step = 'sync-conflict-merge';
  await pageA.fill('input[aria-label="Connection name"]', 'Alexis');
  await pageA.fill('input[aria-label="Connection profile link"]', legacyCompare.codes[0]);
  await pageA.click('text=Add connection');
  await pageA.waitForTimeout(3000); // debounce (1.5s) + push
  await pageB.fill('input[aria-label="Connection name"]', 'Drew');
  await pageB.fill('input[aria-label="Connection profile link"]', legacyCompare.codes[1]);
  await pageB.click('text=Add connection');
  // B's push conflicts, merges, re-pushes; the merge surfaces A's item on B.
  await pageB.waitForSelector('.vault-item-name:has-text("Alexis")', { timeout: 20000 });
  await pageA.click('text=🔄 Sync now');
  await pageA.waitForSelector('.vault-item-name:has-text("Drew")', { timeout: 20000 });

  // --- tombstones: deletion propagates and does not resurrect ---------------
  step = 'sync-tombstone';
  await pageA
    .locator('.vault-item', { hasText: 'Drew' })
    .locator('button:has-text("Remove")')
    .click();
  await pageA.waitForTimeout(3000);
  await pageB.click('text=🔄 Sync now');
  await pageB.waitForFunction(
    () => ![...document.querySelectorAll('.vault-item-name')].some((n) => n.textContent === 'Drew'),
    { timeout: 20000 },
  );
  // B edits and pushes; Drew must stay dead on A afterward.
  await pageB.fill('input[aria-label="Connection name"]', 'Emerson');
  await pageB.fill('input[aria-label="Connection profile link"]', legacyProfile.code);
  await pageB.click('text=Add connection');
  await pageB.waitForTimeout(3000);
  await pageA.click('text=🔄 Sync now');
  await pageA.waitForSelector('.vault-item-name:has-text("Emerson")', { timeout: 20000 });
  const namesOnA = await pageA.$$eval('.vault-item-name', (els) => els.map((e) => e.textContent));
  if (namesOnA.includes('Drew')) fail('tombstoned connection resurrected');

  await devA.close();
  await devB.close();

  // --- zero-knowledge at rest: raw server DB must contain no plaintext ------
  step = 'sync-zero-knowledge-at-rest';
  syncProc.kill('SIGTERM'); // clean close checkpoints WAL into the main file
  await new Promise((resolve) => syncProc.on('exit', resolve));
  let dbBytes = '';
  for (const suffix of ['', '-wal', '-shm']) {
    const f = syncDbPath + suffix;
    if (existsSync(f)) dbBytes += readFileSync(f, 'latin1');
  }
  for (const marker of ['Casey', 'Alexis', 'Drew', 'Emerson', 'River', 'connections', 'profiles']) {
    if (dbBytes.includes(marker)) fail(`plaintext "${marker}" found in server database at rest`);
  }

  if (errors.length) fail('console errors: ' + errors.join(' | '));
  console.log('E2E PASS');
} catch (err) {
  console.error('E2E FAIL:', err.message);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'FAIL.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
  if (!syncProc.killed) syncProc.kill('SIGKILL');
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(syncDbPath + suffix, { force: true });
  }
}
