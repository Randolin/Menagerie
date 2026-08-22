import { computed, inject, Injectable, signal } from '@angular/core';
import {
  VaultRepository,
  type Answers,
  type VaultConnection,
  type VaultData,
  type VaultProfile,
  type VaultSession,
} from '@moxy/core';
import { APP_STORAGE } from './storage.token';

/**
 * Session-holding wrapper around the stateless core VaultRepository.
 * The CryptoKey lives in a private field — never in a signal, never
 * persisted — so the vault locks on reload, by design.
 */
@Injectable({ providedIn: 'root' })
export class VaultStore {
  private readonly repo = new VaultRepository(inject(APP_STORAGE));
  private session: VaultSession | null = null;

  private readonly _data = signal<VaultData | null>(null);
  readonly unlocked = computed(() => this._data() !== null);
  readonly profiles = computed<readonly VaultProfile[]>(() => this._data()?.profiles ?? []);
  readonly connections = computed<readonly VaultConnection[]>(
    () => this._data()?.connections ?? [],
  );

  /** True when a vault was opened/created; false when none exists for this passphrase. */
  async open(passphrase: string, opts: { createIfMissing?: boolean } = {}): Promise<boolean> {
    const session = await this.repo.open(passphrase, opts);
    if (!session) return false;
    this.session = session;
    this.refresh();
    return true;
  }

  lock(): void {
    this.session = null;
    this._data.set(null);
  }

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
    Object.assign(c, patch);
    await this.persist();
  }

  async deleteConnection(id: string): Promise<void> {
    const s = this.require();
    s.data.connections = s.data.connections.filter((c) => c.id !== id);
    await this.persist();
  }

  exportBlob(): string {
    return this.repo.exportBlob(this.require());
  }

  async importBlob(text: string, passphrase: string): Promise<void> {
    this.session = await this.repo.importBlob(text, passphrase);
    this.refresh();
  }

  private require(): VaultSession {
    if (!this.session) throw new Error('Vault is locked.');
    return this.session;
  }

  private async persist(): Promise<void> {
    await this.repo.persist(this.require());
    this.refresh();
  }

  private refresh(): void {
    // New object identity so computeds re-evaluate after in-place edits.
    this._data.set(this.session ? { ...this.session.data } : null);
  }
}
