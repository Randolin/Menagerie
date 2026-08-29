import { TestBed } from '@angular/core/testing';
import { MemoryStorage } from '@moxy/core';
import { DraftStore } from './draft.store';
import { DraftVault } from './draft-vault';
import { APP_STORAGE } from './storage.token';

const DRAFT_KEY = 'moxy.draft.v1';
const KEEP_KEY = 'moxy.draft.keep.v1';

async function aesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * The vault is the one place in the app that writes answers to disk, so what
 * these tests pin is not "it round-trips" but the three properties that made
 * writing them to disk acceptable at all: off unless asked, unreadable at
 * rest, and unopenable by the next person to use the device.
 */
describe('the draft vault', () => {
  let storage: MemoryStorage;
  let vault: DraftVault;
  let draft: DraftStore;

  beforeEach(() => {
    storage = new MemoryStorage();
    TestBed.configureTestingModule({
      providers: [{ provide: APP_STORAGE, useValue: storage }],
    });
    vault = TestBed.inject(DraftVault);
    draft = TestBed.inject(DraftStore);
  });

  it('is off until asked, and writes nothing while it is', async () => {
    vault.arm(await aesKey());
    draft.set('ls.alcohol', 2);
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 600));
    expect(vault.enabled()).toBe(false);
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
    expect(await vault.restore()).toBeNull();
  });

  it('keeps the draft once opted in, and hands it back to the same key', async () => {
    const key = await aesKey();
    vault.arm(key);
    draft.set('ls.alcohol', 2);
    draft.setWeight('ls.alcohol', 3);
    draft.setAcceptable('ls.alcohol', [0, 1]);
    await vault.setEnabled(true);

    const restored = await vault.restore();
    expect(restored?.answers).toEqual({ 'ls.alcohol': 2 });
    expect(restored?.weights).toEqual({ 'ls.alcohol': 3 });
    expect(restored?.acceptable).toEqual({ 'ls.alcohol': [0, 1] });
    expect(storage.getItem(KEEP_KEY)).toBe('1');
  });

  it('stores no readable trace of what was answered', async () => {
    vault.arm(await aesKey());
    draft.set('dp.cuddle', 3);
    await vault.setEnabled(true);

    const stored = storage.getItem(DRAFT_KEY) ?? '';
    expect(stored.length).toBeGreaterThan(0);
    // Item ids and values are the whole sensitive payload; neither may survive
    // into the stored blob in any form a person could read off the device.
    expect(stored).not.toContain('dp.cuddle');
    expect(stored).not.toContain('cuddle');
    expect(stored).not.toContain('answers');
  });

  it('gives a different profile nothing, and drops the blob it cannot open', async () => {
    vault.arm(await aesKey());
    draft.set('ls.alcohol', 2);
    await vault.setEnabled(true);
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull();

    // A second person logs in on this device: same storage, different key.
    vault.arm(await aesKey());
    expect(await vault.restore()).toBeNull();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('persists a change made after the opt-in, without being asked again', async () => {
    vault.arm(await aesKey());
    await vault.setEnabled(true);
    draft.set('ls.alcohol', 1);
    TestBed.tick();

    await new Promise((r) => setTimeout(r, 600));
    expect((await vault.restore())?.answers).toEqual({ 'ls.alcohol': 1 });
  });

  it('forgets the draft on opt-out, on logout, and once it has been saved', async () => {
    const key = await aesKey();
    for (const end of [() => vault.disarm(), () => vault.clear()]) {
      vault.arm(key);
      draft.set('ls.alcohol', 2);
      await vault.setEnabled(true);
      expect(storage.getItem(DRAFT_KEY)).not.toBeNull();
      end();
      expect(storage.getItem(DRAFT_KEY)).toBeNull();
    }

    vault.arm(key);
    await vault.setEnabled(true);
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull();
    await vault.setEnabled(false);
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
    expect(storage.getItem(KEEP_KEY)).toBeNull();
  });
});
