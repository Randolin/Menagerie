import { computed, inject, Injectable, signal } from '@angular/core';
import {
  buildMatchTokens,
  buildSharePayload,
  canonicalViewPhrase,
  decryptBlob,
  deriveEditKeys,
  deriveViewKeys,
  emptyPrivData,
  encryptBlob,
  HatchError,
  migratePrivData,
  mintEditPhrase,
  mintViewPhrase,
  personaFromViewPhrase,
  randomSalt,
  viewUrlFor,
  type Answers,
  type EditKeys,
  type Persona,
  type PrivData,
  type ProfilePayload,
  type SavedConnection,
  type ViewKeys,
} from '@moxy/core';
import { APP_STORAGE } from './storage.token';
import { DraftStore } from './draft.store';
import { ServerConfigStore } from './server-config.store';

/** Edit phrase for this tab only — gone when the tab closes. */
const SESSION_KEY = 'moxy.hatch.session.v1';
/** Edit phrase across restarts — ONLY behind the explicit opt-in checkbox. */
const REMEMBER_KEY = 'moxy.hatch.remember.v1';

export type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

/**
 * The logged-in profile: phrases, derived keys, decrypted private data, and
 * the CAS version — everything needed to read, edit, re-key, and delete.
 * Working answers live in DraftStore (the item editors bind to it); save()
 * snapshots them into both encrypted blobs and pushes.
 */
@Injectable({ providedIn: 'root' })
export class ProfileSessionStore {
  private readonly config = inject(ServerConfigStore);
  private readonly draft = inject(DraftStore);
  private readonly storage = inject(APP_STORAGE);

  readonly active = signal(false);
  readonly editPhrase = signal<string | null>(null);
  readonly viewPhrase = signal<string | null>(null);
  readonly persona = signal<Persona | null>(null);
  readonly version = signal(0);
  readonly populated = signal(false);
  readonly connections = signal<readonly SavedConnection[]>([]);
  readonly saveState = signal<SaveState>('idle');
  readonly remembered = signal(false);

  /** Answers as last persisted to the server — drives the dirty flag. */
  private readonly savedAnswers = signal<Answers>({});
  readonly dirty = computed(
    () => JSON.stringify(this.draft.answers()) !== JSON.stringify(this.savedAnswers()),
  );

  private editKeys: EditKeys | null = null;
  private viewKeys: ViewKeys | null = null;
  private priv: PrivData | null = null;
  /** Serializes saves so two rapid clicks can't race the CAS version. */
  private chain: Promise<unknown> = Promise.resolve();

  viewUrl(): string | null {
    const phrase = this.viewPhrase();
    return phrase ? viewUrlFor(phrase) : null;
  }

  /**
   * Create the profile NOW — QR and both phrases exist before any answer.
   * Locator collisions (astronomically rare) remint and retry.
   */
  async hatch(): Promise<void> {
    const client = this.requireClient();
    for (let attempt = 0; ; attempt++) {
      const viewPhrase = await mintViewPhrase();
      const editPhrase = await mintEditPhrase();
      const viewKeys = await deriveViewKeys(viewPhrase);
      const editKeys = await deriveEditKeys(editPhrase);
      const priv = emptyPrivData(viewPhrase);
      const payload: ProfilePayload = { v: 1, a: {} };
      try {
        await client.create(
          {
            view_locator: viewKeys.viewLocator,
            edit_locator: editKeys.editLocator,
            blob_view: await encryptBlob(payload, viewKeys.viewKey),
            blob_priv: await encryptBlob(priv, editKeys.editKey),
          },
          editKeys.editToken,
        );
      } catch (err) {
        if (err instanceof HatchError && err.failure.kind === 'locator_taken' && attempt < 3) {
          continue;
        }
        throw err;
      }
      await this.adopt(editPhrase, editKeys, priv, viewKeys, 1, false);
      return;
    }
  }

  /** True on success; false when no profile answers to that phrase. */
  async login(rawEditPhrase: string): Promise<boolean> {
    const client = this.requireClient();
    const editPhrase = rawEditPhrase.trim();
    if (!editPhrase) return false;
    const editKeys = await deriveEditKeys(editPhrase);
    const record = await client.getEdit(editKeys.editLocator);
    if (!record) return false;
    const priv = migratePrivData(await decryptBlob(record.blob_priv, editKeys.editKey));
    const viewKeys = await deriveViewKeys(priv.viewPhrase);
    await this.adopt(editPhrase, editKeys, priv, viewKeys, record.version, record.populated);
    return true;
  }

  /** Rebuild the session from this tab (or, if opted in, this device). */
  async restore(): Promise<boolean> {
    if (this.active()) return true;
    const phrase = this.readSession() ?? this.readRemembered();
    if (!phrase) return false;
    try {
      return await this.login(phrase);
    } catch {
      return false;
    }
  }

  /** Push the current draft answers to the server (serialized, CAS). */
  save(): Promise<void> {
    const run = this.chain.then(() => this.doSave());
    this.chain = run.catch(() => undefined);
    return run;
  }

  /**
   * New creature ≡ new view phrase ≡ every old link, QR, and desire
   * fingerprint dies. Desires salt rotates in the same atomic update.
   */
  async regenerateViewPhrase(): Promise<void> {
    const client = this.requireClient();
    const { editKeys, priv } = this.requireSession();
    const answers = this.draft.answers();
    for (let attempt = 0; ; attempt++) {
      const viewPhrase = await mintViewPhrase();
      const viewKeys = await deriveViewKeys(viewPhrase);
      const nextPriv: PrivData = { ...priv, viewPhrase, desiresSalt: null, answers };
      const { blobView, blobPriv, populated } = await this.encryptState(nextPriv, viewKeys);
      try {
        const version = await client.put(editKeys.editLocator, editKeys.editToken, this.version(), {
          blob_view: blobView,
          blob_priv: blobPriv,
          populated,
          new_view_locator: viewKeys.viewLocator,
        });
        this.viewKeys = viewKeys;
        this.priv = nextPriv;
        this.viewPhrase.set(viewPhrase);
        this.persona.set(await personaFromViewPhrase(viewPhrase));
        this.version.set(version);
        this.populated.set(this.populated() || populated);
        this.savedAnswers.set(structuredClone(answers) as Answers);
        return;
      } catch (err) {
        if (err instanceof HatchError && err.failure.kind === 'locator_taken' && attempt < 3) {
          continue;
        }
        throw err;
      }
    }
  }

  /** Mints and switches to a new edit phrase; returns it for one-time display. */
  async changeEditPhrase(): Promise<string> {
    const client = this.requireClient();
    const { editKeys, viewKeys, priv } = this.requireSession();
    const answers = this.draft.answers();
    for (let attempt = 0; ; attempt++) {
      const editPhrase = await mintEditPhrase();
      const nextKeys = await deriveEditKeys(editPhrase);
      const nextPriv: PrivData = { ...priv, answers };
      const blobPriv = await encryptBlob(nextPriv, nextKeys.editKey);
      const { blobView, populated } = await this.encryptState(nextPriv, viewKeys);
      try {
        const version = await client.put(
          editKeys.editLocator,
          editKeys.editToken,
          this.version(),
          {
            blob_view: blobView,
            blob_priv: blobPriv,
            populated,
            new_edit_locator: nextKeys.editLocator,
          },
          nextKeys.editToken,
        );
        this.editKeys = nextKeys;
        this.priv = nextPriv;
        this.editPhrase.set(editPhrase);
        this.version.set(version);
        this.populated.set(this.populated() || populated);
        this.savedAnswers.set(structuredClone(answers) as Answers);
        this.writeSession(editPhrase);
        if (this.remembered()) this.writeRemembered(editPhrase);
        return editPhrase;
      } catch (err) {
        if (err instanceof HatchError && err.failure.kind === 'locator_taken' && attempt < 3) {
          continue;
        }
        throw err;
      }
    }
  }

  /** Server-side delete, then a full local logout. */
  async deleteProfile(): Promise<void> {
    const client = this.requireClient();
    const { editKeys } = this.requireSession();
    await client.remove(editKeys.editLocator, editKeys.editToken);
    this.logout();
  }

  /** Forget the session locally; the profile stays on the server. */
  logout(): void {
    this.active.set(false);
    this.editPhrase.set(null);
    this.viewPhrase.set(null);
    this.persona.set(null);
    this.version.set(0);
    this.populated.set(false);
    this.connections.set([]);
    this.saveState.set('idle');
    this.savedAnswers.set({});
    this.editKeys = null;
    this.viewKeys = null;
    this.priv = null;
    try {
      globalThis.sessionStorage?.removeItem(SESSION_KEY);
    } catch {
      /* fine */
    }
    try {
      this.storage.removeItem(REMEMBER_KEY);
    } catch {
      /* fine */
    }
    this.remembered.set(false);
    this.draft.clear();
  }

  setRemember(on: boolean): void {
    const phrase = this.editPhrase();
    if (on && phrase) this.writeRemembered(phrase);
    else {
      try {
        this.storage.removeItem(REMEMBER_KEY);
      } catch {
        /* fine */
      }
    }
    this.remembered.set(on && Boolean(phrase));
  }

  async addConnection(label: string, rawViewPhrase: string): Promise<void> {
    const viewPhrase = canonicalViewPhrase(rawViewPhrase);
    const now = Date.now();
    const connection: SavedConnection = {
      id: crypto.randomUUID(),
      label: label.trim() || viewPhrase.split('-').slice(0, 3).join('-'),
      viewPhrase,
      notes: '',
      addedAt: now,
      updatedAt: now,
    };
    this.mutateConnections((list) =>
      list.some((c) => c.viewPhrase === viewPhrase) ? [...list] : [...list, connection],
    );
    await this.save();
  }

  async removeConnection(id: string): Promise<void> {
    this.mutateConnections((list) => list.filter((c) => c.id !== id));
    await this.save();
  }

  // ---- internals ----------------------------------------------------------

  private async doSave(): Promise<void> {
    const client = this.requireClient();
    const { editKeys, viewKeys, priv } = this.requireSession();
    this.saveState.set('saving');
    const answers = structuredClone(this.draft.answers()) as Answers;
    const nextPriv: PrivData = { ...priv, answers };
    try {
      const { blobView, blobPriv, populated } = await this.encryptState(nextPriv, viewKeys);
      const version = await client.put(editKeys.editLocator, editKeys.editToken, this.version(), {
        blob_view: blobView,
        blob_priv: blobPriv,
        populated,
      });
      this.priv = nextPriv;
      this.version.set(version);
      this.populated.set(this.populated() || populated);
      this.connections.set(nextPriv.connections);
      this.savedAnswers.set(answers);
      this.saveState.set('saved');
    } catch (err) {
      if (err instanceof HatchError && err.failure.kind === 'conflict') {
        // Someone else (another tab/device) saved first. Adopt their state —
        // the server's copy wins, the local edit is the casualty and the UI
        // says so.
        const remote = err.failure.remote;
        const remotePriv = migratePrivData(
          await decryptBlob(remote.blob_priv, editKeys.editKey),
        );
        this.priv = remotePriv;
        this.version.set(remote.version);
        this.connections.set(remotePriv.connections);
        this.savedAnswers.set(structuredClone(remotePriv.answers) as Answers);
        this.draft.loadFrom(remotePriv.answers);
        this.saveState.set('conflict');
        return;
      }
      this.saveState.set('error');
      throw err;
    }
  }

  /**
   * Encrypts both halves of the record from one PrivData. The view blob is
   * the share payload: open answers plus salted desire fingerprints, with the
   * per-profile salt minted on first need (mintSalt) and persisted in priv.
   */
  private async encryptState(
    priv: PrivData,
    viewKeys: ViewKeys,
  ): Promise<{ blobView: string; blobPriv: string; populated: boolean }> {
    if (!this.editKeys) throw new Error('No active session.');
    const answers = priv.answers;
    const wantsTokens = Object.entries(answers).some(
      ([k, v]) => k.startsWith('dp.') && typeof v === 'number' && v >= 1,
    );
    if (wantsTokens && !priv.desiresSalt) priv.desiresSalt = randomSalt();
    const salt = priv.desiresSalt;
    const tokens = wantsTokens && salt ? await buildMatchTokens(answers, salt) : [];
    const payload = buildSharePayload(answers, tokens, salt);
    return {
      blobView: await encryptBlob(payload, viewKeys.viewKey),
      blobPriv: await encryptBlob(priv, this.editKeys.editKey),
      populated: Object.keys(answers).length > 0,
    };
  }

  private async adopt(
    editPhrase: string,
    editKeys: EditKeys,
    priv: PrivData,
    viewKeys: ViewKeys,
    version: number,
    populated: boolean,
  ): Promise<void> {
    this.editKeys = editKeys;
    this.viewKeys = viewKeys;
    this.priv = priv;
    this.editPhrase.set(editPhrase);
    this.viewPhrase.set(priv.viewPhrase);
    this.persona.set(await personaFromViewPhrase(priv.viewPhrase));
    this.version.set(version);
    this.populated.set(populated);
    this.connections.set(priv.connections);
    this.savedAnswers.set(structuredClone(priv.answers) as Answers);
    this.saveState.set('idle');
    this.draft.loadFrom(priv.answers);
    this.active.set(true);
    this.writeSession(editPhrase);
    this.remembered.set(this.readRemembered() === editPhrase);
  }

  private mutateConnections(fn: (list: readonly SavedConnection[]) => SavedConnection[]): void {
    const { priv } = this.requireSession();
    priv.connections = fn(priv.connections);
    this.connections.set(priv.connections);
  }

  private requireClient() {
    const client = this.config.client();
    if (!client) throw new Error('No profile server is configured.');
    return client;
  }

  private requireSession(): { editKeys: EditKeys; viewKeys: ViewKeys; priv: PrivData } {
    if (!this.editKeys || !this.viewKeys || !this.priv) throw new Error('No active session.');
    return { editKeys: this.editKeys, viewKeys: this.viewKeys, priv: this.priv };
  }

  private readSession(): string | null {
    try {
      return globalThis.sessionStorage?.getItem(SESSION_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private writeSession(phrase: string): void {
    try {
      globalThis.sessionStorage?.setItem(SESSION_KEY, phrase);
    } catch {
      /* private-mode etc. — the session just won't survive a reload */
    }
  }

  private readRemembered(): string | null {
    try {
      return this.storage.getItem(REMEMBER_KEY);
    } catch {
      return null;
    }
  }

  private writeRemembered(phrase: string): void {
    try {
      this.storage.setItem(REMEMBER_KEY, phrase);
    } catch {
      /* fine */
    }
  }
}
