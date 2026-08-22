import { computed, inject, Injectable, signal } from '@angular/core';
import {
  VaultRepository,
  SyncClient,
  SyncError,
  canonicalVaultJson,
  decryptVault,
  deriveVaultKeys,
  mergeVaultData,
  migrateVaultData,
  type Answers,
  type VaultConnection,
  type VaultData,
  type VaultProfile,
  type VaultSession,
} from '@moxy/core';
import { APP_STORAGE } from './storage.token';
import { SyncSettingsStore } from './sync-settings.store';

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'conflict-resolving' | 'error';

/**
 * Session-holding wrapper around the stateless core VaultRepository, plus the
 * sync orchestration. The CryptoKey lives in a private field — never in a
 * signal, never persisted — so the vault locks on reload, by design. All
 * sync operations are serialized through one promise chain so pushes never
 * interleave.
 */
@Injectable({ providedIn: 'root' })
export class VaultStore {
  private readonly repo = new VaultRepository(inject(APP_STORAGE));
  private readonly settings = inject(SyncSettingsStore);

  private session: VaultSession | null = null;
  private remoteVersion = 0;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private opChain: Promise<void> = Promise.resolve();
  private pendingRemoteDelete: { locator: string; writeToken: string } | null = null;

  private readonly _data = signal<VaultData | null>(null);
  private readonly _syncStatus = signal<SyncStatus>('off');

  readonly unlocked = computed(() => this._data() !== null);
  readonly profiles = computed<readonly VaultProfile[]>(() => this._data()?.profiles ?? []);
  readonly connections = computed<readonly VaultConnection[]>(
    () => this._data()?.connections ?? [],
  );
  readonly syncEnabled = computed(() => this._data()?.sync?.enabled === true);
  readonly syncStatus = this._syncStatus.asReadonly();
  readonly lastSyncError = signal<string | null>(null);

  // --- unlock / lock -------------------------------------------------------

  /**
   * True when a vault was opened or created. Tries local storage first; when
   * nothing is local and a sync server is configured, falls back to fetching
   * the encrypted blob by locator — the log-in-from-a-new-device flow.
   * Throws (with a user-facing message) only when a remote vault exists but
   * cannot be decrypted.
   */
  async open(passphrase: string, opts: { createIfMissing?: boolean } = {}): Promise<boolean> {
    const keys = await deriveVaultKeys(passphrase);
    const local = await this.repo.openWithKeys(keys, opts);
    if (local) {
      this.adopt(local, this.remoteVersionFor(local));
      if (this.syncEnabled() && this.client()) this.enqueue(() => this.pullMergePush());
      return true;
    }
    const client = this.client();
    if (opts.createIfMissing || !client) return false;

    let record;
    try {
      record = await client.get(keys.locator);
    } catch {
      this.lastSyncError.set('Could not reach the sync server to look for this vault.');
      return false;
    }
    if (!record) return false;
    let data: VaultData;
    try {
      data = migrateVaultData(await decryptVault<unknown>(record.blob, keys.key));
    } catch {
      throw new Error(
        'A vault exists on the sync server for this passphrase, but it could not be decrypted. ' +
          'If you never synced a vault there, someone else may have stored data at this address — ' +
          'consider a different passphrase.',
      );
    }
    this.repo.storeVerifiedBlob(keys.locator, record.blob);
    const session = await this.repo.openWithKeys(keys);
    if (!session) return false;
    this.adopt(session, record.version);
    this._syncStatus.set('synced');
    return true;
  }

  lock(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    this.session = null;
    this.remoteVersion = 0;
    this.pendingRemoteDelete = null;
    this._data.set(null);
    this._syncStatus.set('off');
    this.lastSyncError.set(null);
  }

  // --- data mutations ------------------------------------------------------

  async saveProfile(label: string, answers: Answers, id: string | null = null): Promise<string> {
    const s = this.require();
    const now = Date.now();
    if (id) {
      const p = s.data.profiles.find((x) => x.id === id);
      if (!p) throw new Error('Profile not found.');
      p.label = label;
      p.answers = structuredClone(answers) as Answers;
      p.updatedAt = now;
    } else {
      id = crypto.randomUUID();
      s.data.profiles.push({
        id,
        label,
        answers: structuredClone(answers) as Answers,
        createdAt: now,
        updatedAt: now,
      });
    }
    await this.persist();
    return id;
  }

  async deleteProfile(id: string): Promise<void> {
    const s = this.require();
    s.data.profiles = s.data.profiles.filter((p) => p.id !== id);
    s.data.tombstones.push({ id, deletedAt: Date.now() });
    await this.persist();
  }

  async saveConnection(label: string, code: string, notes = ''): Promise<void> {
    const s = this.require();
    const now = Date.now();
    s.data.connections.push({
      id: crypto.randomUUID(),
      label,
      code,
      notes,
      addedAt: now,
      updatedAt: now,
    });
    await this.persist();
  }

  async updateConnection(id: string, patch: Partial<VaultConnection>): Promise<void> {
    const s = this.require();
    const c = s.data.connections.find((x) => x.id === id);
    if (!c) throw new Error('Connection not found.');
    Object.assign(c, patch, { updatedAt: Date.now() });
    await this.persist();
  }

  async deleteConnection(id: string): Promise<void> {
    const s = this.require();
    s.data.connections = s.data.connections.filter((c) => c.id !== id);
    s.data.tombstones.push({ id, deletedAt: Date.now() });
    await this.persist();
  }

  exportBlob(): string {
    return this.repo.exportBlob(this.require());
  }

  async importBlob(text: string, passphrase: string): Promise<void> {
    this.session = await this.repo.importBlob(text, passphrase);
    this.remoteVersion = 0;
    this.refresh();
  }

  // --- sync ----------------------------------------------------------------

  async enableSync(): Promise<void> {
    const s = this.require();
    if (!this.client()) throw new Error('Set a sync server address first.');
    s.data.sync = { enabled: true, enabledAt: Date.now() };
    await this.persistLocalOnly();
    await this.run(async () => {
      try {
        await this.pushOnce();
      } catch (err) {
        // First push failed outright — revert enrollment so the UI is honest.
        const current = this.session;
        if (current) {
          delete current.data.sync;
          await this.persistLocalOnly();
        }
        this._syncStatus.set('off');
        throw err;
      }
    });
  }

  async disableSync(opts: { deleteRemote: boolean }): Promise<void> {
    const s = this.require();
    await this.run(async () => {
      if (opts.deleteRemote) {
        const client = this.client();
        if (client) await client.remove(s.locator, s.writeToken);
      }
      delete s.data.sync;
      await this.persistLocalOnly();
      this.remoteVersion = 0;
      this._syncStatus.set('off');
      this.lastSyncError.set(null);
    });
  }

  async syncNow(): Promise<void> {
    this.require();
    await this.run(() => this.pullMergePush());
  }

  /**
   * Create-new-then-delete-old, so there is never a moment without a working
   * copy: the new local slot and (when syncing) the new remote vault must
   * both exist before anything old is removed.
   */
  async changePassphrase(newPassphrase: string): Promise<void> {
    const old = this.require();
    const newKeys = await deriveVaultKeys(newPassphrase);
    const next: VaultSession = {
      locator: newKeys.locator,
      key: newKeys.key,
      writeToken: newKeys.writeToken,
      data: old.data,
    };
    await this.repo.persist(next); // new local slot alongside the old one

    await this.run(async () => {
      const client = this.client();
      if (this.syncEnabled() && client) {
        try {
          const blob = this.repo.currentBlob(next.locator);
          this.remoteVersion = await client.put(next.locator, next.writeToken, blob ?? '', 0);
        } catch (err) {
          this.repo.removeSlot(next.locator); // rollback; old vault fully intact
          throw new Error(
            'Could not move the synced vault to the new passphrase — nothing was changed. ' +
              this.describe(err),
          );
        }
        try {
          await client.remove(old.locator, old.writeToken);
        } catch {
          // Old remote copy is stale ciphertext still openable by the OLD
          // passphrase until this delete succeeds; retried on next sync.
          this.pendingRemoteDelete = { locator: old.locator, writeToken: old.writeToken };
          this.lastSyncError.set(
            'The old server copy could not be deleted yet; the old passphrase still opens that stale copy. Will retry on the next sync.',
          );
        }
      } else {
        this.remoteVersion = 0;
      }
      this.repo.removeSlot(old.locator);
      this.session = next;
      this.refresh();
      if (this.syncEnabled() && client) this._syncStatus.set('synced');
    });
  }

  // --- internals -----------------------------------------------------------

  private client(): SyncClient | null {
    const url = this.settings.serverUrl();
    return url ? new SyncClient(url) : null;
  }

  private require(): VaultSession {
    if (!this.session) throw new Error('Vault is locked.');
    return this.session;
  }

  private adopt(session: VaultSession, remoteVersion: number): void {
    this.session = session;
    this.remoteVersion = remoteVersion;
    this.refresh();
  }

  private remoteVersionFor(session: VaultSession): number {
    // Reopening the same vault in one app session keeps the known version.
    return this.session?.locator === session.locator ? this.remoteVersion : 0;
  }

  private refresh(): void {
    // New object identity so computeds re-evaluate after in-place edits.
    this._data.set(this.session ? { ...this.session.data } : null);
  }

  private async persist(): Promise<void> {
    await this.persistLocalOnly();
    this.schedulePush();
  }

  private async persistLocalOnly(): Promise<void> {
    await this.repo.persist(this.require());
    this.refresh();
  }

  private schedulePush(): void {
    if (!this.syncEnabled() || !this.client()) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    // Debounce coalesces bursts (typing notes) AND coarsens the edit-timing
    // metadata the server could observe.
    this.pushTimer = setTimeout(() => {
      this.enqueue(() => this.pushOnce());
    }, 1500);
  }

  /** Fire-and-forget path: surfaces failures via status + lastSyncError. */
  private enqueue(op: () => Promise<void>): void {
    void this.run(op).catch(() => {
      /* status/lastSyncError already set by fail() */
    });
  }

  /** Serialize all sync work; rethrows to await-ing callers. */
  private run(op: () => Promise<void>): Promise<void> {
    const next = this.opChain.then(async () => {
      try {
        await op();
      } catch (err) {
        this.fail(err);
        throw err;
      }
    });
    this.opChain = next.catch(() => undefined);
    return next;
  }

  private fail(err: unknown): void {
    this._syncStatus.set('error');
    this.lastSyncError.set(this.describe(err));
  }

  private describe(err: unknown): string {
    if (err instanceof SyncError) {
      switch (err.failure.kind) {
        case 'bad_token':
          return 'The server refused this vault’s write token. If you never synced here, another vault may occupy this address — changing your passphrase moves you to a fresh one.';
        case 'network':
          return 'Could not reach the sync server. Your data is safe locally; syncing will retry.';
        case 'too_large':
          return 'This vault is larger than the server accepts.';
        case 'rate_limited':
          return 'The server asked us to slow down; try again shortly.';
        default:
          return `Sync failed (${err.failure.kind}).`;
      }
    }
    return err instanceof Error ? err.message : String(err);
  }

  /** Push local state; on version conflict, merge and retry (bounded). */
  private async pushOnce(maxAttempts = 3): Promise<void> {
    const client = this.client();
    if (!client || !this.session || !this.syncEnabled()) return;
    this._syncStatus.set('syncing');
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const s = this.require();
      const blob = this.repo.currentBlob(s.locator);
      if (blob === null) throw new Error('Local vault blob missing.');
      try {
        this.remoteVersion = await client.put(s.locator, s.writeToken, blob, this.remoteVersion);
        this._syncStatus.set('synced');
        this.lastSyncError.set(null);
        await this.retryPendingDelete(client);
        return;
      } catch (err) {
        if (err instanceof SyncError && err.failure.kind === 'conflict') {
          this._syncStatus.set('conflict-resolving');
          await this.absorbRemote(err.failure.remote.blob, err.failure.remote.version);
          continue; // re-push the merged state
        }
        throw err;
      }
    }
    throw new Error('Sync kept conflicting; use “Sync now” to retry.');
  }

  /** Pull → merge → persist → push if anything local isn't on the server. */
  private async pullMergePush(): Promise<void> {
    const client = this.client();
    if (!client || !this.session || !this.syncEnabled()) return;
    this._syncStatus.set('syncing');
    const s = this.require();
    const record = await client.get(s.locator);
    let remoteCanonical: string | null = null;
    if (record) {
      remoteCanonical = await this.absorbRemote(record.blob, record.version);
    } else {
      this.remoteVersion = 0; // server lost it (or never had it): recreate
    }
    const localCanonical = canonicalVaultJson(this.require().data);
    if (remoteCanonical !== localCanonical) {
      await this.pushOnce();
    } else {
      this._syncStatus.set('synced');
      this.lastSyncError.set(null);
      await this.retryPendingDelete(client);
    }
  }

  /** Merge a remote blob into the session; returns the REMOTE canonical form. */
  private async absorbRemote(blob: string, version: number): Promise<string> {
    const s = this.require();
    const remoteData = migrateVaultData(await decryptVault<unknown>(blob, s.key));
    const merged = mergeVaultData(s.data, remoteData);
    this.session = { locator: s.locator, key: s.key, writeToken: s.writeToken, data: merged };
    this.remoteVersion = version;
    await this.repo.persist(this.session);
    this.refresh();
    return canonicalVaultJson(remoteData);
  }

  private async retryPendingDelete(client: SyncClient): Promise<void> {
    if (!this.pendingRemoteDelete) return;
    const { locator, writeToken } = this.pendingRemoteDelete;
    try {
      await client.remove(locator, writeToken);
      this.pendingRemoteDelete = null;
      this.lastSyncError.set(null);
    } catch {
      /* keep pending; retried on the next successful sync */
    }
  }
}
