import { describe, expect, test } from 'vitest';
import { MemoryStorage } from '../storage/storage';
import { DraftRepository } from './draft-repo';
import { VaultRepository, type VaultSession } from './vault-repo';
import { sampleAnswers } from '../codec/codec.spec';

describe('vault', () => {
  test('create, reopen, wrong passphrase, ciphertext at rest, export/import', async () => {
    const storage = new MemoryStorage();
    const repo = new VaultRepository(storage);
    const pass = 'correct horse battery staple luck';

    let session = (await repo.open(pass, { createIfMissing: true }))!;
    expect(session).toBeTruthy();

    const now = Date.now();
    session.data.profiles.push({
      id: 'p1',
      label: 'Me',
      answers: sampleAnswers(),
      createdAt: now,
      updatedAt: now,
    });
    session.data.connections.push({
      id: 'c1',
      label: 'Alex',
      code: 'm1.abc',
      notes: 'met at book club',
      addedAt: now,
    });
    await repo.persist(session);

    // Wrong passphrase → no vault found (different locator), not an error.
    expect(await repo.open('wrong words entirely here now')).toBeNull();

    // Normalized passphrase reopens the same vault.
    const reopened = (await repo.open('  Correct   HORSE battery-staple luck '))!;
    expect(reopened).toBeTruthy();
    expect(reopened.data.profiles).toHaveLength(1);
    expect(reopened.data.profiles[0].id).toBe('p1');
    expect(reopened.data.connections[0].label).toBe('Alex');

    // Ciphertext at rest: raw storage must not contain answers.
    expect(storage.dump()).not.toContain('River');
    expect(storage.dump()).not.toContain('Alex');

    // Export → wipe → import round-trip.
    const blob = repo.exportBlob(reopened);
    storage.clear();
    await expect(repo.importBlob(blob, 'wrong words')).rejects.toThrow(/does not match/);
    const restored = await repo.importBlob(blob, pass);
    expect(restored.data.profiles[0].label).toBe('Me');
  });

  test('sessions are caller-owned state — repository holds nothing', async () => {
    const storage = new MemoryStorage();
    const repo = new VaultRepository(storage);
    const s1 = await repo.open('one passphrase for this vault', { createIfMissing: true });
    const s2 = await repo.open('another one for a second vault', { createIfMissing: true });
    expect(s1!.locator).not.toBe(s2!.locator);
    // Both usable independently; nothing shared through the repo.
    await repo.persist(s1 as VaultSession);
    await repo.persist(s2 as VaultSession);
  });

  test('draft repository round-trips and clears', () => {
    const storage = new MemoryStorage();
    const drafts = new DraftRepository(storage);
    expect(drafts.load()).toBeNull();
    drafts.save(sampleAnswers());
    expect(drafts.load()!['ab.name']).toBe('River');
    drafts.clear();
    expect(drafts.load()).toBeNull();
  });
});
