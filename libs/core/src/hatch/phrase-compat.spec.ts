// Backward-compatibility guard for view phrases minted BEFORE the wordlists
// grew 64 → 128 (and the tail expansions 2,048 → 4,096).
//
// These ten vectors were captured from the pre-growth code and pasted here
// verbatim. They encode the claim that makes append-only growth safe:
// validation is membership-based (`isViewPhraseShaped` uses .includes/Set.has)
// and derivation hashes the literal phrase string — neither ever touches a
// list INDEX. So a longer list widens the mint space without renaming a single
// creature or invalidating a single credential.
//
// If one of these fails, an append was not pure: something was reordered,
// removed, or replaced. Fix the wordlist, never these vectors.
import { describe, expect, test } from 'vitest';
import { deriveViewKeys } from './keys';
import { isViewPhraseShaped } from './phrases';
import { personaFromViewPhrase } from '../persona/persona';

interface Vector {
  readonly phrase: string;
  readonly viewLocator: string;
  readonly name: string;
  readonly emoji: string;
  readonly color: string;
  readonly color2: string;
  readonly colorIndex: number;
}

const VECTORS: readonly Vector[] = [
  {
    phrase: 'amber-azure-fox-mistlit-moonworn-fernhollow',
    viewLocator: 'Cnj9cm4z-ogLd9zQxnD7vA',
    name: 'amber-azure-fox', emoji: '🦊',
    color: '#0b5e8a', color2: '#1e5f9e', colorIndex: 11,
  },
  {
    phrase: 'bold-wavy-sheep-wolfsworn-ravenetched-maplelanding',
    viewLocator: 'lmskAOZM9chilK6eGSkOeA',
    name: 'bold-wavy-sheep', emoji: '🐑',
    color: '#0f766e', color2: '#1f6e9e', colorIndex: 6,
  },
  {
    phrase: 'brave-crimson-otter-emberlit-frostbound-briarcove',
    viewLocator: 'jL9oGnmQ69xPsh9eHZxNDw',
    name: 'brave-crimson-otter', emoji: '🦦',
    color: '#386641', color2: '#8f1f33', colorIndex: 9,
  },
  {
    phrase: 'cosmic-midnight-dragon-starwoven-nightveiled-ravenspire',
    viewLocator: 'CsqmL7Io4v6iRGZQoL-_bg',
    name: 'cosmic-midnight-dragon', emoji: '🐉',
    color: '#8b2f5c', color2: '#1c2440', colorIndex: 0,
  },
  {
    phrase: 'gentle-mossy-frog-fernkissed-dewtouched-cloverfen',
    viewLocator: 'p_u3kDgwzZZhqZJZsl6ljQ',
    name: 'gentle-mossy-frog', emoji: '🐸',
    color: '#6d597a', color2: '#4f6b2f', colorIndex: 15,
  },
  {
    phrase: 'mighty-scarlet-lion-flameforged-ashcast-cinderkeep',
    viewLocator: 'pnVV7TWqMOwdfB9rk7ui9g',
    name: 'mighty-scarlet-lion', emoji: '🦁',
    color: '#386641', color2: '#b32020', colorIndex: 9,
  },
  {
    phrase: 'quiet-snowy-owl-frostlaced-winterswept-hollywell',
    viewLocator: 'OHl3pIBV_DvQ-qwNs40tSQ',
    name: 'quiet-snowy-owl', emoji: '🦉',
    color: '#8a4b16', color2: '#5b6d7d', colorIndex: 3,
  },
  {
    phrase: 'swift-jade-dolphin-tidespun-wavewashed-coralshore',
    viewLocator: '5givAwJv1DVj3ehY1ADfcg',
    name: 'swift-jade-dolphin', emoji: '🐬',
    color: '#386641', color2: '#23755f', colorIndex: 9,
  },
  {
    phrase: 'wild-verdant-wolf-thornmarked-ivycrowned-bramblewood',
    viewLocator: 'Ud8kK3gMiInQdq9KTUcSIw',
    name: 'wild-verdant-wolf', emoji: '🐺',
    color: '#5b3aa7', color2: '#1f7a33', colorIndex: 4,
  },
  {
    phrase: 'winter-twilight-penguin-snowborn-fogveiled-driftlanding',
    viewLocator: 'RBk6BQUtARfmfuNahtVDuA',
    name: 'winter-twilight-penguin', emoji: '🐧',
    color: '#0f766e', color2: '#4f3a7d', colorIndex: 6,
  },
];

describe('pre-growth view phrases', () => {
  test.each(VECTORS)('$phrase still validates', ({ phrase }) => {
    expect(isViewPhraseShaped(phrase)).toBe(true);
  });

  test.each(VECTORS)('$phrase derives the same key material', async (v) => {
    const keys = await deriveViewKeys(v.phrase);
    expect(keys.viewLocator).toBe(v.viewLocator);
  });

  test.each(VECTORS)('$phrase derives the same creature', async (v) => {
    const persona = await personaFromViewPhrase(v.phrase);
    expect(persona).not.toBeNull();
    expect(persona?.name).toBe(v.name);
    expect(persona?.emoji).toBe(v.emoji);
    expect(persona?.color).toBe(v.color);
    expect(persona?.color2).toBe(v.color2);
    expect(persona?.colorIndex).toBe(v.colorIndex);
  });
});
