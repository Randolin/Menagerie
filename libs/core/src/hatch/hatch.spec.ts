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
import { deriveVaultKeys } from '../crypto/vault-crypto';

const FROZEN_VIEW_PHRASE = 'amber-azure-fox-canal-stove-plume';
const FROZEN_EDIT_PHRASE = 'correct horse battery staple luck';

describe('hatch key derivation (frozen vectors)', () => {
  // Captured from the shipped implementation. If these fail, every hatched
  // profile's locators/tokens silently change. Fix the regression, never the
  // values.
  test('view keys', async () => {
    const keys = await deriveViewKeys(FROZEN_VIEW_PHRASE);
    expect(keys.viewLocator).toBe('Fa63esdIBN1zBlK1yIhCuQ');
    // Hyphens and spaces normalize identically.
    const spaced = await deriveViewKeys('amber azure fox canal stove plume');
    expect(spaced.viewLocator).toBe(keys.viewLocator);
  });

  test('edit keys', async () => {
    const keys = await deriveEditKeys(FROZEN_EDIT_PHRASE);
    expect(keys.editLocator).toBe('BcMN9qp5Bhn0QxaQ4KXFig');
    expect(keys.editToken).toBe('uPACZV93COs-4KPtsdb1xg');
  });

  test('domains are disjoint: same phrase, different roles, different keys', async () => {
    const view = await deriveViewKeys(FROZEN_EDIT_PHRASE);
    const edit = await deriveEditKeys(FROZEN_EDIT_PHRASE);
    const vault = await deriveVaultKeys(FROZEN_EDIT_PHRASE);
    const locators = [view.viewLocator, edit.editLocator, vault.locator];
    expect(new Set(locators).size).toBe(3);
  });
});

describe('phrase minting and shape', () => {
  test('view phrase: 6 words with the fixed grammar; head words are the persona', async () => {
    for (let i = 0; i < 10; i++) {
      const phrase = await mintViewPhrase();
      const words = phrase.split('-');
      expect(words).toHaveLength(6);
      expect(ADJECTIVES_A).toContain(words[0]);
      expect(ADJECTIVES_B).toContain(words[1]);
      expect(ANIMALS.some((a) => a.name === words[2])).toBe(true);
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

  test('extraction from phrase text and from view URLs', () => {
    expect(extractViewPhrase('  Amber Azure Fox canal stove plume ')).toBe(FROZEN_VIEW_PHRASE);
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

describe('persona v2', () => {
  test('frozen color vector; identity is the literal head words', async () => {
    const persona = await personaFromViewPhrase(FROZEN_VIEW_PHRASE);
    expect(persona?.name).toBe('amber-azure-fox');
    expect(persona?.emoji).toBe('🦊');
    expect(persona?.colorIndex).toBe(3);
  });

  test('color depends on the secret tail; identity does not', async () => {
    const other = await personaFromViewPhrase('amber-azure-fox-other-tail-words');
    expect(other?.name).toBe('amber-azure-fox');
    // (colors may coincide 1/16 of the time; assert only derivability)
    expect(other?.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('non-list words yield null', async () => {
    expect(await personaFromViewPhrase('nope-nope-nope-a-b-c')).toBeNull();
  });
});

describe('blob envelope', () => {
  test('round-trips through deflate + AES-GCM; wrong key fails', async () => {
    const { viewKey } = await deriveViewKeys(FROZEN_VIEW_PHRASE);
    const payload = { v: 1, a: { 'ab.name': 'River' }, s: 'saltsaltsalt' };
    const blob = await encryptBlob(payload, viewKey);
    expect(blob).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decryptBlob(blob, viewKey)).toEqual(payload);

    const { editKey } = await deriveEditKeys(FROZEN_EDIT_PHRASE);
    await expect(decryptBlob(blob, editKey)).rejects.toThrow();
  });

  test('fresh IV per encryption: same plaintext, different ciphertext', async () => {
    const { viewKey } = await deriveViewKeys(FROZEN_VIEW_PHRASE);
    const a = await encryptBlob({ x: 1 }, viewKey);
    const b = await encryptBlob({ x: 1 }, viewKey);
    expect(a).not.toBe(b);
  });
});

describe('priv data', () => {
  test('empty shape and migration guard', () => {
    const priv = emptyPrivData(FROZEN_VIEW_PHRASE);
    expect(priv.viewPhrase).toBe(FROZEN_VIEW_PHRASE);
    expect(migratePrivData(priv)).toBe(priv);
    expect(() => migratePrivData({ v: 99 })).toThrow(/Unknown private-data version/);
  });
});
