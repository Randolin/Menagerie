import { describe, expect, test } from 'vitest';
import { deriveEditKeys, deriveViewKeys } from './keys';
import {
  canonicalViewPhrase,
  extractViewPhrase,
  isViewPhraseShaped,
  mintEditPhrase,
  mintViewPhrase,
  viewUrlFor,
} from './phrases';
import { encryptBlob, decryptBlob } from './blob';
import { emptyPrivData, migratePrivData } from './priv-data';
import { personaFromViewPhrase } from '../persona/persona';
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS } from '../persona/wordlists';
import { TAIL_ADJECTIVES, TAIL_PLACES } from '../persona/tail-wordlists';
import { derivePhraseKeys } from '../crypto/phrase-kdf';

const FROZEN_VIEW_PHRASE = 'amber-azure-fox-mistwoven-emberlit-fernhollow';
const FROZEN_EDIT_PHRASE = 'correct horse battery staple luck';

describe('hatch key derivation (frozen vectors, KDF v2)', () => {
  // Captured from the shipped implementation. If these fail, every hatched
  // profile's locators/tokens silently change. Fix the regression, never the
  // values.
  test('view keys', async () => {
    const keys = await deriveViewKeys(FROZEN_VIEW_PHRASE);
    expect(keys.viewLocator).toBe('mqmD75lVULwTR2Cc7-Evrw');
    // Hyphens and spaces normalize identically.
    const spaced = await deriveViewKeys('amber azure fox mistwoven emberlit fernhollow');
    expect(spaced.viewLocator).toBe(keys.viewLocator);
  }, 30000);

  test('edit keys', async () => {
    const keys = await deriveEditKeys(FROZEN_EDIT_PHRASE);
    expect(keys.editLocator).toBe('pwvxu5seTpcPAcCWJzt_yA');
    expect(keys.editToken).toBe('K5QmUY-sjMVH3BcOZmxfJQ');
  }, 30000);

  test('domains are disjoint: same phrase, different roles, different keys', async () => {
    const view = await deriveViewKeys(FROZEN_EDIT_PHRASE);
    const edit = await deriveEditKeys(FROZEN_EDIT_PHRASE);
    const other = await derivePhraseKeys(FROZEN_EDIT_PHRASE, 'a-third-domain-for-this-test');
    const locators = [view.viewLocator, edit.editLocator, other.locator];
    expect(new Set(locators).size).toBe(3);
  }, 30000);
});

describe('phrase minting and shape', () => {
  test('view phrase: creature head + poetic tail, per grammar', async () => {
    const tailAdj = new Set(TAIL_ADJECTIVES);
    const tailPlaces = new Set(TAIL_PLACES);
    for (let i = 0; i < 10; i++) {
      const phrase = await mintViewPhrase();
      const words = phrase.split('-');
      expect(words).toHaveLength(6);
      expect(ADJECTIVES_A).toContain(words[0]);
      expect(ADJECTIVES_B).toContain(words[1]);
      expect(ANIMALS.some((a) => a.name === words[2])).toBe(true);
      expect(tailAdj.has(words[3])).toBe(true);
      expect(tailAdj.has(words[4])).toBe(true);
      expect(tailPlaces.has(words[5])).toBe(true);
      expect(isViewPhraseShaped(phrase)).toBe(true);

      const persona = await personaFromViewPhrase(phrase);
      expect(persona?.name).toBe(words.slice(0, 3).join('-'));
    }
  });

  test('edit phrase: 5 free words, NOT view-shaped', async () => {
    const phrase = await mintEditPhrase();
    expect(phrase.split(' ')).toHaveLength(5);
    expect(isViewPhraseShaped(phrase)).toBe(false);
  });

  test('tail words outside the lists are rejected', () => {
    expect(isViewPhraseShaped('amber-azure-fox-random-junk-words')).toBe(false);
    expect(isViewPhraseShaped('amber-azure-fox-mistwoven-emberlit-notaplace')).toBe(false);
  });

  test('extraction from phrase text and from view URLs', () => {
    expect(extractViewPhrase('  Amber Azure Fox mistwoven emberlit fernhollow ')).toBe(
      FROZEN_VIEW_PHRASE,
    );
    expect(extractViewPhrase(`https://host/app/#/view/${FROZEN_VIEW_PHRASE}`)).toBe(
      FROZEN_VIEW_PHRASE,
    );
    expect(extractViewPhrase('definitely not a phrase')).toBeNull();
    expect(extractViewPhrase('amber-azure-fox')).toBeNull(); // persona alone is not a credential
    expect(viewUrlFor(FROZEN_VIEW_PHRASE, 'https://host/app/')).toBe(
      `https://host/app/#/view/${FROZEN_VIEW_PHRASE}`,
    );
  });

  test('canonicalization is idempotent', () => {
    expect(canonicalViewPhrase(canonicalViewPhrase('A B-c'))).toBe(canonicalViewPhrase('a-b-c'));
  });
});

describe('persona v3', () => {
  test('frozen color vector; identity is the literal head words', async () => {
    const persona = await personaFromViewPhrase(FROZEN_VIEW_PHRASE);
    expect(persona?.name).toBe('amber-azure-fox');
    expect(persona?.emoji).toBe('🦊');
    expect(persona?.colorIndex).toBe(1);
    expect(persona?.color).toBe('#2f6b4f');
  });

  test('color derives from the HEAD only — the chip leaks nothing about the tail', async () => {
    const other = await personaFromViewPhrase('amber-azure-fox-starworn-dewkissed-moonvale');
    expect(other?.name).toBe('amber-azure-fox');
    expect(other?.colorIndex).toBe(1);
    expect(other?.color).toBe('#2f6b4f');
  });

  test('non-list words yield null', async () => {
    expect(await personaFromViewPhrase('nope-nope-nope-a-b-c')).toBeNull();
  });
});

describe('blob envelope', () => {
  test('round-trips through deflate + AES-GCM; wrong key fails', async () => {
    const { viewKey } = await deriveViewKeys(FROZEN_VIEW_PHRASE);
    const payload = { v: 2, a: { 'ab.age': 1, 'ls.pets': [0, 4] }, s: 'saltsaltsalt' };
    const blob = await encryptBlob(payload, viewKey);
    expect(blob).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decryptBlob(blob, viewKey)).toEqual(payload);

    const { editKey } = await deriveEditKeys(FROZEN_EDIT_PHRASE);
    await expect(decryptBlob(blob, editKey)).rejects.toThrow();
  }, 30000);

  test('fresh IV per encryption: same plaintext, different ciphertext', async () => {
    const { viewKey } = await deriveViewKeys(FROZEN_VIEW_PHRASE);
    const a = await encryptBlob({ x: 1 }, viewKey);
    const b = await encryptBlob({ x: 1 }, viewKey);
    expect(a).not.toBe(b);
  }, 30000);
});

describe('priv data', () => {
  test('empty shape and migration guard', () => {
    const priv = emptyPrivData(FROZEN_VIEW_PHRASE);
    expect(priv.viewPhrase).toBe(FROZEN_VIEW_PHRASE);
    expect(migratePrivData(priv)).toBe(priv);
    expect(() => migratePrivData({ v: 99 })).toThrow(/Unknown private-data version/);
  });
});
