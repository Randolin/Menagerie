// Render the creature sprites to an HTML contact sheet.
//
//   npm run sprites                    # every sprite, alphabetical
//   npm run sprites -- --only=fox,owl  # just these
//   npm run sprites -- --new           # only the ones with no sprite yet (as emoji)
//   npm run sprites -- --out=/tmp/x.html
//
// This exists because 16×16 grids cannot be reviewed as text. Every sprite in
// the menagerie was drawn by writing a grid, rendering it here, looking at it,
// and re-cutting the ones that did not read — the poodle took three passes and
// the mammoth's tusks two. Guessing from the letters does not work.
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { ANIMALS } from '@moxy/core';
import { CREATURE_SPRITES } from '../libs/ui/src/creatures/pixel-grids';
import { spriteSvg } from '../libs/ui/src/creatures/pixel-art';

const { values } = parseArgs({
  options: {
    only: { type: 'string' },
    new: { type: 'boolean', default: false },
    out: { type: 'string', default: '/tmp/sprite-sheet.html' },
    size: { type: 'string', default: '96' },
  },
});

const size = Number(values.size);
const only = values.only ? new Set(values.only.split(',').map((s) => s.trim())) : null;

const rows = ANIMALS.filter((a) => {
  if (only) return only.has(a.name);
  if (values.new) return !CREATURE_SPRITES[a.name];
  return true;
}).map((a) => {
  const sprite = CREATURE_SPRITES[a.name];
  const art = sprite
    ? spriteSvg(sprite, size)
    : `<span style="font-size:${size * 0.8}px;line-height:1">${a.emoji}</span>`;
  return `<figure${sprite ? '' : ' class="missing"'}>${art}<figcaption>${a.name}</figcaption></figure>`;
});

const html = `<!doctype html><meta charset="utf-8"><title>Menagerie sprites (${rows.length})</title>
<style>
  body { background: #fdfcfa; color: #26262b; font-family: system-ui, sans-serif;
         margin: 0; padding: 18px; display: flex; flex-wrap: wrap; gap: 12px; }
  figure { margin: 0; text-align: center; background: #fff; border: 1px solid #eae6e0;
           border-radius: 10px; padding: 8px; display: flex; flex-direction: column;
           align-items: center; justify-content: center; }
  /* An emoji here means the animal has no sprite — the thing this sheet is for. */
  .missing { border-color: #d03b3b; background: #fdf3f3; }
  figcaption { font-size: 10px; color: #6b6b73; margin-top: 4px; }
</style>
${rows.join('\n')}`;

writeFileSync(values.out, html);
console.log(`${rows.length} creatures → ${values.out}`);
