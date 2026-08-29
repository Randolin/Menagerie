// Render the link-preview card to public/social-card.png.
//
//   npm run social-card
//
// The first sight of Menagerie for most second people is an unfurl in a chat
// app, not the site — so this image is doing the introduction. It is
// deliberately generic: it names the product, never the sender, because a
// phrase link and a bare link must be indistinguishable in a preview. That
// preview is visible to shoulders the phrase was never meant for.
//
// Generated rather than hand-exported so it stays reproducible from the repo,
// and drawn from the real sprites so it cannot drift into showing creatures
// the app doesn't have. Chromium does the rasterising because SVG is not a
// format link unfurlers reliably render, and playwright-core is already here
// for the e2e.
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { CREATURE_SPRITES } from '../libs/ui/src/creatures/pixel-grids';
import { spriteRects } from '../libs/ui/src/creatures/pixel-art';

/** Wide, unmistakable silhouettes — this is read at thumbnail size. */
const CAST = ['fox', 'owl', 'otter', 'hedgehog', 'deer', 'axolotl'];

const OUT = fileURLToPath(new URL('../public/social-card.png', import.meta.url));
const CHROMIUM = process.env.CHROMIUM_BIN ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const sprites = CAST.map((name) => {
  const sprite = CREATURE_SPRITES[name];
  if (!sprite) throw new Error(`no sprite for ${name} — pick another for the card`);
  const n = sprite.rows.length;
  return (
    `<svg viewBox="0 0 ${n} ${n}" width="150" height="150" shape-rendering="crispEdges">` +
    spriteRects(sprite) +
    '</svg>'
  );
}).join('');

const html = `<!doctype html><meta charset="utf-8">
<style>
  @page { margin: 0 }
  html, body { margin: 0; padding: 0; }
  body {
    width: 1200px; height: 630px; box-sizing: border-box;
    background: #fdfcfa; color: #26262b;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 76px 80px 0;
  }
  h1 { font-size: 96px; margin: 0; letter-spacing: -2px; color: #4a3aa7; }
  p.lede { font-size: 44px; margin: 18px 0 0; font-weight: 600; line-height: 1.15; }
  p.sub { font-size: 28px; margin: 20px 0 0; color: #57555f; line-height: 1.35; }
  .cast { display: flex; justify-content: space-between; align-items: flex-end;
          padding-bottom: 56px; }
</style>
<body>
  <div>
    <h1>Menagerie</h1>
    <p class="lede">Compatibility, minus the identity.</p>
    <p class="sub">Anonymous profiles you compare by sharing a phrase.<br>No accounts, no names — the server stores only ciphertext it can't read.</p>
  </div>
  <div class="cast">${sprites}</div>
</body>`;

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: OUT });
await browser.close();
console.log(`wrote ${OUT}`);
