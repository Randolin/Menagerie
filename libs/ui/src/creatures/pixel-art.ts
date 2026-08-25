// Pixel-art creature renderer — pure string builder, no Angular. The grids
// in pixel-grids.ts are the source of truth; this turns one into an inline
// SVG string that the creature-icon component (and the QR badge) can embed.
import { CREATURE_SPRITES, type PixelSprite } from './pixel-grids';

/** Just the <rect> runs (horizontal same-color merges) — for embedding. */
export function spriteRects(sprite: PixelSprite): string {
  const n = sprite.rows.length;
  const parts: string[] = [];
  for (let r = 0; r < n; r++) {
    const row = sprite.rows[r];
    let c = 0;
    while (c < n) {
      const letter = row[c];
      if (letter === '.') {
        c++;
        continue;
      }
      let end = c + 1;
      while (end < n && row[end] === letter) end++;
      const fill = sprite.palette[letter];
      if (fill)
        parts.push(`<rect x="${c}" y="${r}" width="${end - c}" height="1" fill="${fill}"/>`);
      c = end;
    }
  }
  return parts.join('');
}

/** Rows-of-letters → standalone crisp-edges SVG. */
export function spriteSvg(sprite: PixelSprite, size: number): string {
  const n = sprite.rows.length;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" ` +
    `width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">` +
    spriteRects(sprite) +
    '</svg>'
  );
}

/**
 * SVG string for an animal's pixel icon, or null when no sprite exists —
 * callers fall back to the emoji, so partial coverage is always safe.
 */
export function creaturePixelSvg(animalName: string, size = 16): string | null {
  const sprite = CREATURE_SPRITES[animalName];
  return sprite ? spriteSvg(sprite, size) : null;
}

/** Embeddable rect runs for an animal (16×16 user units), or null. */
export function creatureSpriteRects(animalName: string): string | null {
  const sprite = CREATURE_SPRITES[animalName];
  return sprite ? spriteRects(sprite) : null;
}
