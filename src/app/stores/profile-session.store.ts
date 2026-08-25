import { computed, inject, Injectable, signal } from '@angular/core';
import {
  boopPublicKey,
  buildMatchTokens,
  buildSharePayload,
  canonicalViewPhrase,
  decryptBlob,
  deriveEditKeys,
  deriveViewKeys,
  emptyPrivData,
  encryptBlob,
  generateBoopKeyPair,
  HatchError,
  migratePrivData,
  mintEditPhrase,
  mintViewPhrase,
  personaFromViewPhrase,
  PROFILE_VERSION,
  randomLocator,
  randomSalt,
  randomToken,
  viewUrlFor,
  type Acceptable,
  type Answers,
  type BoopContent,
  type BoopCreds,
  type Weights,
  type EditKeys,
  type Persona,
  type PrivData,
  type ProfilePayload,
  type SavedConnection,
  type SavedGroupMembership,
  type SentBoop,
  type ViewKeys,
} from '@moxy/core';
import { clone } from './clone';
import { APP_STORAGE } from './storage.token';
import { DraftStore } from './draft.store';
import { ServerConfigStore } from './server-config.store';

/** Edit phrase for this tab only — gone when the tab closes. */
const SESSION_KEY = 'moxy.hatch.session.v1';
/** Edit phrase across restarts — ONLY behind the explicit opt-in checkbox. */
const REMEMBER_KEY = 'moxy.hatch.remember.v1';

export type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

/** A knock from my inbox, opened and validated. */
export interface IncomingBoop {
  id: string;
  created: number;
  content: BoopContent;
}

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
  readonly groups = signal<readonly SavedGroupMembership[]>([]);
  readonly metricsOptIn = signal(false);
  readonly incomingBoops = signal<readonly IncomingBoop[]>([]);
  readonly sentBoops = signal<readonly SentBoop[]>([]);
  readonly saveState = signal<SaveState>('idle');
  readonly remembered = signal(false);

  /** Draft state as last persisted to the server — drives the dirty flag. */
  private readonly savedSnapshot = signal(ProfileSessionStore.draftSnapshot({}, {}, {}));
  readonly dirty = computed(
    () =>
      ProfileSessionStore.draftSnapshot(
        this.draft.answers(),
        this.draft.weights(),
        this.draft.acceptable(),
      ) !== this.savedSnapshot(),
  );

  private static draftSnapshot(a: Answers, w: Weights, ac: Acceptable): string {
    return JSON.stringify([a, w, ac]);
  }

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
    await this.withRemint(async () => {
      const viewPhrase = await mintViewPhrase();
      const editPhrase = await mintEditPhrase();
      const viewKeys = await deriveViewKeys(viewPhrase);
      const editKeys = await deriveEditKeys(editPhrase);
      const priv = emptyPrivData(viewPhrase);
      const payload: ProfilePayload = { v: PROFILE_VERSION, a: {} };
      await client.create(
        {
          view_locator: viewKeys.viewLocator,
          edit_locator: editKeys.editLocator,
          blob_view: await encryptBlob(payload, viewKeys.viewKey),
          blob_priv: await encryptBlob(priv, editKeys.editKey),
        },
        editKeys.editToken,
      );
      await this.adopt(editPhrase, editKeys, priv, viewKeys, 1, false);
    });
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
    // The boop identity rotates with the view phrase: fresh keypair, fresh
    // inbox, published in the same atomic PUT. Old knockers lose the
    // address — rotation IS the block lever.
    const oldBoop = priv.boop;
    const nextBoop: BoopCreds | undefined = oldBoop
      ? {
          priv: (await generateBoopKeyPair()).priv,
          inbox: randomLocator(),
          token: randomToken(),
        }
      : undefined;
    await this.withRemint(async () => {
      const viewPhrase = await mintViewPhrase();
      const viewKeys = await deriveViewKeys(viewPhrase);
      const nextPriv: PrivData = {
        ...priv,
        viewPhrase,
        desiresSalt: null,
        answers,
        weights: this.draft.weights(),
        acceptable: this.draft.acceptable(),
        boop: nextBoop,
      };
      const { blobView, blobPriv, populated } = await this.encryptState(nextPriv, viewKeys);
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
      this.snapshotSaved(nextPriv);
      // Best-effort inbox swap: a failed delete falls to GC; a failed
      // create self-heals on the next poll. Unread knocks die with the
      // old inbox — correct for a rotation.
      if (oldBoop && nextBoop) {
        this.incomingBoops.set([]);
        await client.deleteBoopInbox(oldBoop.inbox, oldBoop.token).catch(() => undefined);
        await client.createBoopInbox(nextBoop.inbox, nextBoop.token).catch(() => undefined);
      }
    });
  }

  /** Mints and switches to a new edit phrase; returns it for one-time display. */
  async changeEditPhrase(): Promise<string> {
    const client = this.requireClient();
    const { editKeys, viewKeys, priv } = this.requireSession();
    const answers = this.draft.answers();
    return this.withRemint(async () => {
      const editPhrase = await mintEditPhrase();
      const nextKeys = await deriveEditKeys(editPhrase);
      const nextPriv: PrivData = {
        ...priv,
        answers,
        weights: this.draft.weights(),
        acceptable: this.draft.acceptable(),
      };
      const blobPriv = await encryptBlob(nextPriv, nextKeys.editKey);
      const { blobView, populated } = await this.encryptState(nextPriv, viewKeys);
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
      this.snapshotSaved(nextPriv);
      this.writeSession(editPhrase);
      if (this.remembered()) this.writeRemembered(editPhrase);
      return editPhrase;
    });
  }

  /**
   * Server-side delete, then a full local logout. Boop inboxes go first:
   * the server can't cascade rows it can't link to the profile, so the
   * client tears them down (best-effort — a missed one orphans to GC).
   */
  async deleteProfile(): Promise<void> {
    const client = this.requireClient();
    const { editKeys, priv } = this.requireSession();
    if (priv.boop) {
      await client.deleteBoopInbox(priv.boop.inbox, priv.boop.token).catch(() => undefined);
    }
    for (const sent of priv.sentBoops ?? []) {
      await client
        .deleteBoopInbox(sent.replyBox.locator, sent.replyBox.token)
        .catch(() => undefined);
    }
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
    this.groups.set([]);
    this.metricsOptIn.set(false);
    this.incomingBoops.set([]);
    this.sentBoops.set([]);
    this.saveState.set('idle');
    this.savedSnapshot.set(ProfileSessionStore.draftSnapshot({}, {}, {}));
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

  // ---- boop inbox lifecycle (the messaging flows live in BoopStore) -------

  /**
   * Make this profile boopable: mint a sealed-box keypair and a random
   * inbox, persist the credentials in PrivData FIRST (a tab dying between
   * save and registration must never strand a registered inbox nobody can
   * read), then register the inbox. The save also publishes `k` in the view
   * blob; a knock racing the registration gets a 404 and reads as "can't be
   * booped yet". Safe to call repeatedly — it self-heals a missing inbox.
   */
  async ensureBoopInbox(): Promise<void> {
    const client = this.requireClient();
    const { priv } = this.requireSession();
    if (!priv.boop) {
      const pair = await generateBoopKeyPair();
      priv.boop = { priv: pair.priv, inbox: randomLocator(), token: randomToken() };
      await this.save();
    }
    const creds = priv.boop;
    try {
      await client.createBoopInbox(creds.inbox, creds.token);
    } catch (err) {
      if (err instanceof HatchError && err.failure.kind === 'locator_taken') {
        // Ours already (an earlier run registered it) — or, absurdly, a
        // random collision. A token-authenticated read distinguishes them;
        // ONLY an explicit bad_token may discard credentials — a transient
        // failure must never rotate a published inbox out from under us.
        try {
          const mine = await client.listKnocks(creds.inbox, creds.token);
          if (mine !== null) return;
          return this.ensureBoopInbox(); // row vanished mid-race — re-register
        } catch (probeErr) {
          if (probeErr instanceof HatchError && probeErr.failure.kind === 'bad_token') {
            priv.boop = undefined;
            await this.save();
            return this.ensureBoopInbox();
          }
          return; // transient — keep credentials; a later poll self-heals
        }
      }
      throw err;
    }
  }

  // ---- internal API for the domain stores (groups/boops/metrics) ----------
  // GroupMembershipStore, BoopStore, and MetricsStore build on these; they
  // are not meant for components, which should call the domain stores.

  /**
   * Run a mint-and-register attempt, re-minting on the astronomically rare
   * locator collision (server 409 locator_taken), up to three retries.
   */
  async withRemint<T>(attempt: () => Promise<T>): Promise<T> {
    for (let tries = 0; ; tries++) {
      try {
        return await attempt();
      } catch (err) {
        if (err instanceof HatchError && err.failure.kind === 'locator_taken' && tries < 3) {
          continue;
        }
        throw err;
      }
    }
  }

  // ---- internals ----------------------------------------------------------

  private async doSave(): Promise<void> {
    const client = this.requireClient();
    const { editKeys, viewKeys, priv } = this.requireSession();
    this.saveState.set('saving');
    const answers = clone(this.draft.answers());
    const nextPriv: PrivData = {
      ...priv,
      answers,
      weights: clone(this.draft.weights()),
      acceptable: clone(this.draft.acceptable()),
    };
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
      this.snapshotSaved(nextPriv);
      this.saveState.set('saved');
    } catch (err) {
      if (err instanceof HatchError && err.failure.kind === 'conflict') {
        // Someone else (another tab/device) saved first. Adopt their state —
        // the server's copy wins, the local edit is the casualty and the UI
        // says so.
        const remote = err.failure.remote;
        const remotePriv = migratePrivData(await decryptBlob(remote.blob_priv, editKeys.editKey));
        this.priv = remotePriv;
        this.version.set(remote.version);
        this.connections.set(remotePriv.connections);
        this.groups.set(remotePriv.groups ?? []);
        this.sentBoops.set(remotePriv.sentBoops ?? []);
        this.snapshotSaved(remotePriv);
        this.draft.loadFrom(remotePriv.answers, remotePriv.weights, remotePriv.acceptable);
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
    const payload = buildSharePayload(
      answers,
      tokens,
      salt,
      priv.weights ?? {},
      priv.acceptable ?? {},
      // Boop reachability rides ONLY here — the view blob. Group deposits
      // build their snapshots without it, by design.
      priv.boop ? { pub: boopPublicKey(priv.boop.priv), inbox: priv.boop.inbox } : undefined,
    );
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
    this.groups.set(priv.groups ?? []);
    this.metricsOptIn.set(priv.metricsOptIn === true);
    this.sentBoops.set(priv.sentBoops ?? []);
    this.incomingBoops.set([]);
    this.snapshotSaved(priv);
    this.saveState.set('idle');
    this.draft.loadFrom(priv.answers, priv.weights, priv.acceptable);
    this.active.set(true);
    this.writeSession(editPhrase);
    this.remembered.set(this.readRemembered() === editPhrase);
    // Legacy profiles become boopable on their next login; fire-and-forget
    // (save() serializes internally, so this can't race the user's edits).
    void this.ensureBoopInbox().catch(() => undefined);
  }

  /** Records what the server now holds, for the dirty comparison. */
  private snapshotSaved(priv: PrivData): void {
    this.savedSnapshot.set(
      ProfileSessionStore.draftSnapshot(priv.answers, priv.weights ?? {}, priv.acceptable ?? {}),
    );
  }

  private mutateConnections(fn: (list: readonly SavedConnection[]) => SavedConnection[]): void {
    const { priv } = this.requireSession();
    priv.connections = fn(priv.connections);
    this.connections.set(priv.connections);
  }

  mutateGroups(fn: (list: readonly SavedGroupMembership[]) => SavedGroupMembership[]): void {
    const { priv } = this.requireSession();
    priv.groups = fn(priv.groups ?? []);
    this.groups.set(priv.groups);
  }

  mutateSentBoops(fn: (list: readonly SentBoop[]) => SentBoop[]): void {
    const { priv } = this.requireSession();
    priv.sentBoops = fn(priv.sentBoops ?? []);
    this.sentBoops.set(priv.sentBoops);
  }

  requireClient() {
    const client = this.config.client();
    if (!client) throw new Error('No profile server is configured.');
    return client;
  }

  /** The decrypted private data, or null when logged out. */
  sessionPriv(): PrivData | null {
    return this.priv;
  }

  requireSession(): { editKeys: EditKeys; viewKeys: ViewKeys; priv: PrivData } {
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
