// Moxy end-to-end suite. Serves the PRODUCTION build (dist/moxy/browser) with
// a plain static file server — proving the zero-server property — and drives
// the real UI in Chromium via playwright-core.
//
// Run: npm run build && npm run e2e
// Env: MOXY_E2E_SHOTS=dir to also capture screenshots.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, mkdirSync } from 'node:fs';
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

  if (errors.length) fail('console errors: ' + errors.join(' | '));
  console.log('E2E PASS');
} catch (err) {
  console.error('E2E FAIL:', err.message);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'FAIL.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
