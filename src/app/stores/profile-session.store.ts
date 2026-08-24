import { computed, inject, Injectable, signal } from '@angular/core';
import {
  boopPublicKey,
  buildBoop,
  buildDeposit,
  buildMatchTokens,
  buildMetricsBuckets,
  currentEpoch,
  deriveMetricsToken,
  buildSharePayload,
  canonicalViewPhrase,
  decryptBlob,
  deriveEditKeys,
  deriveGroupAdminToken,
  deriveGroupReadKeys,
  deriveViewKeys,
  emptyGroupMeta,
  emptyPrivData,
  encryptBlob,
  generateBoopKeyPair,
  HatchError,
  migrateBoopContent,
  migratePrivData,
  mintBoopBoxKey,
  mintEditPhrase,
  mintPseudonym,
  mintViewPhrase,
  openSealed,
  openWithKey,
  personaFromViewPhrase,
  PROFILE_VERSION,
  pseudonymEmoji,
  randomLocator,
  randomSalt,
  randomToken,
  sealTo,
  sealWithKey,
  viewUrlFor,
  type Acceptable,
  type Answers,
  type BoopContact,
  type BoopContent,
  type BoopCreds,
  type BoopReachability,
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
  /** Epochs this tab already submitted (server dedups for real). */
  private readonly submittedEpochs = new Set<string>();
  readonly saveState = signal<SaveState>('idle');
  readonly remembered = signal(false);

  /** Answers/weights as last persisted to the server — drive the dirty flag. */
  private readonly savedAnswers = signal<Answers>({});
  private readonly savedWeights = signal<Weights>({});
  private readonly savedAcceptable = signal<Acceptable>({});
  readonly dirty = computed(
    () =>
      JSON.stringify(this.draft.answers()) !== JSON.stringify(this.savedAnswers()) ||
      JSON.stringify(this.draft.weights()) !== JSON.stringify(this.savedWeights()) ||
      JSON.stringify(this.draft.acceptable()) !== JSON.stringify(this.savedAcceptable()),
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
      const payload: ProfilePayload = { v: PROFILE_VERSION, a: {} };
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
    for (let attempt = 0; ; attempt++) {
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
        this.snapshotSaved(nextPriv);
        // Best-effort inbox swap: a failed delete falls to GC; a failed
        // create self-heals on the next poll. Unread knocks die with the
        // old inbox — correct for a rotation.
        if (oldBoop && nextBoop) {
          this.incomingBoops.set([]);
          await client.deleteBoopInbox(oldBoop.inbox, oldBoop.token).catch(() => undefined);
          await client.createBoopInbox(nextBoop.inbox, nextBoop.token).catch(() => undefined);
        }
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
      const nextPriv: PrivData = {
        ...priv,
        answers,
        weights: this.draft.weights(),
        acceptable: this.draft.acceptable(),
      };
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
        this.snapshotSaved(nextPriv);
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
    this.savedAnswers.set({});
    this.savedWeights.set({});
    this.savedAcceptable.set({});
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

  // ---- groups -------------------------------------------------------------

  /**
   * Mint and register a group. Returns both phrases; the admin phrase is
   * shown once (and kept in PrivData so the creator's login recovers it).
   */
  async createGroup(): Promise<{ groupPhrase: string; adminPhrase: string }> {
    const client = this.requireClient();
    this.requireSession();
    for (let attempt = 0; ; attempt++) {
      const groupPhrase = await mintViewPhrase();
      const adminPhrase = await mintEditPhrase();
      const { groupLocator, groupKey } = await deriveGroupReadKeys(groupPhrase);
      const adminToken = await deriveGroupAdminToken(adminPhrase);
      const blobMeta = await encryptBlob(emptyGroupMeta(Date.now()), groupKey);
      try {
        await client.createGroup({ group_locator: groupLocator, blob_meta: blobMeta }, adminToken);
      } catch (err) {
        if (err instanceof HatchError && err.failure.kind === 'locator_taken' && attempt < 3) {
          continue;
        }
        throw err;
      }
      this.mutateGroups((list) => [
        ...list,
        { id: crypto.randomUUID(), groupPhrase, adminPhrase, addedAt: Date.now() },
      ]);
      await this.save();
      return { groupPhrase, adminPhrase };
    }
  }

  /**
   * Deposit into a group (join, change tier, or refresh a stale snapshot).
   * Tier 1 shares an answer snapshot under a pseudonym; tier 2 adds the view
   * phrase — creature identity and reach-back for every group-phrase holder.
   */
  async depositToGroup(rawGroupPhrase: string, tier: 1 | 2): Promise<void> {
    const client = this.requireClient();
    this.requireSession();
    const groupPhrase = canonicalViewPhrase(rawGroupPhrase);
    const { groupLocator, groupKey } = await deriveGroupReadKeys(groupPhrase);
    const existing = this.groups().find((g) => g.groupPhrase === groupPhrase);
    const pseudonym = existing?.pseudonym
      ? { pseudonym: existing.pseudonym, emoji: existing.emoji ?? pseudonymEmoji(existing.pseudonym) }
      : mintPseudonym();
    const deposit = buildDeposit(
      tier,
      this.draft.answers(),
      this.draft.weights(),
      this.draft.acceptable(),
      tier === 2 ? this.viewPhrase() ?? undefined : undefined,
      pseudonym,
      Date.now(),
    );
    const blobMember = await encryptBlob(deposit, groupKey);

    if (existing?.memberLocator && existing.memberToken) {
      const roster = await client.getGroup(groupLocator);
      const mine = roster?.members.find((m) => m.member_locator === existing.memberLocator);
      if (mine) {
        await client.putMember(
          groupLocator,
          existing.memberLocator,
          existing.memberToken,
          mine.version,
          blobMember,
        );
        this.mutateGroups((list) =>
          list.map((g) =>
            g.id === existing.id
              ? { ...g, tier, pseudonym: pseudonym.pseudonym, emoji: pseudonym.emoji }
              : g,
          ),
        );
        await this.save();
        return;
      }
      // The old deposit is gone (kicked, or the group re-minted) — fresh join.
    }

    const memberLocator = randomLocator();
    const memberToken = randomToken();
    await client.joinGroup(groupLocator, memberToken, {
      member_locator: memberLocator,
      blob_member: blobMember,
    });
    this.mutateGroups((list) => {
      const entry: SavedGroupMembership = {
        id: existing?.id ?? crypto.randomUUID(),
        groupPhrase,
        adminPhrase: existing?.adminPhrase,
        memberLocator,
        memberToken,
        pseudonym: pseudonym.pseudonym,
        emoji: pseudonym.emoji,
        tier,
        addedAt: existing?.addedAt ?? Date.now(),
      };
      return existing ? list.map((g) => (g.id === existing.id ? entry : g)) : [...list, entry];
    });
    await this.save();
  }

  /** Remove my deposit (idempotent if already gone) and forget the group. */
  async leaveGroup(id: string): Promise<void> {
    const client = this.requireClient();
    const entry = this.groups().find((g) => g.id === id);
    if (!entry) return;
    if (entry.memberLocator && entry.memberToken) {
      const { groupLocator } = await deriveGroupReadKeys(entry.groupPhrase);
      await client.removeMember(groupLocator, entry.memberLocator, entry.memberToken, 'member');
    }
    this.mutateGroups((list) => list.filter((g) => g.id !== id));
    await this.save();
  }

  /**
   * Re-mint a group I created: every old invite link, QR, and deposit dies;
   * a fresh roster appears under new phrases. Old deposits are cleared first
   * (they'd be sealed under the dead key anyway); my own is re-deposited.
   * Returns the new group phrase.
   */
  async remintGroup(id: string): Promise<string> {
    const client = this.requireClient();
    const entry = this.groups().find((g) => g.id === id);
    if (!entry?.adminPhrase) throw new Error('Only the group creator can re-mint.');
    const oldAdminToken = await deriveGroupAdminToken(entry.adminPhrase);
    const { groupLocator: oldLocator } = await deriveGroupReadKeys(entry.groupPhrase);
    const roster = await client.getGroup(oldLocator);
    if (!roster) throw new Error('This group no longer exists.');
    for (const member of roster.members) {
      await client.removeMember(oldLocator, member.member_locator, oldAdminToken, 'admin');
    }
    for (let attempt = 0; ; attempt++) {
      const groupPhrase = await mintViewPhrase();
      const adminPhrase = await mintEditPhrase();
      const { groupLocator, groupKey } = await deriveGroupReadKeys(groupPhrase);
      const adminToken = await deriveGroupAdminToken(adminPhrase);
      const blobMeta = await encryptBlob(emptyGroupMeta(Date.now()), groupKey);
      try {
        await client.putGroup(
          oldLocator,
          oldAdminToken,
          roster.version,
          { blob_meta: blobMeta, new_group_locator: groupLocator },
          adminToken,
        );
      } catch (err) {
        if (err instanceof HatchError && err.failure.kind === 'locator_taken' && attempt < 3) {
          continue;
        }
        throw err;
      }
      const hadDeposit = Boolean(entry.memberLocator);
      const tier = entry.tier ?? 1;
      this.mutateGroups((list) =>
        list.map((g) =>
          g.id === id
            ? { ...g, groupPhrase, adminPhrase, memberLocator: undefined, memberToken: undefined }
            : g,
        ),
      );
      await this.save();
      if (hadDeposit) await this.depositToGroup(groupPhrase, tier);
      return groupPhrase;
    }
  }

  // ---- boops --------------------------------------------------------------

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

  /**
   * Stage a boop toward one recipient: the reply box is minted, persisted
   * (see ensureBoopInbox for why persistence comes first), and registered
   * now — at composer-open — so its creation never sits adjacent to the
   * knock POST in the server's view of time; the human filling in the
   * composer provides the jitter.
   */
  async prepareBoop(label: string, emoji: string): Promise<string> {
    const client = this.requireClient();
    const { priv } = this.requireSession();
    const entry: SentBoop = {
      id: crypto.randomUUID(),
      label,
      emoji,
      replyBox: { locator: randomLocator(), token: randomToken(), key: mintBoopBoxKey() },
      sentAt: Date.now(),
      status: 'pending',
    };
    this.mutateSentBoops((list) => [...list, entry]);
    await this.save();
    await client.createBoopInbox(entry.replyBox.locator, entry.replyBox.token);
    return entry.id;
  }

  /** Composer closed without sending: tear the staged reply box down. */
  async discardBoop(id: string): Promise<void> {
    const client = this.requireClient();
    const entry = this.sentBoops().find((b) => b.id === id);
    if (!entry || entry.status !== 'pending') return;
    await client.deleteBoopInbox(entry.replyBox.locator, entry.replyBox.token).catch(() => undefined);
    this.mutateSentBoops((list) => list.filter((b) => b.id !== id));
    await this.save();
  }

  /**
   * Seal and deliver a staged boop. Everything inside is a claim the
   * recipient can't verify — the advisory language in the composer owns
   * that honesty. Throws HatchError not_found when the recipient rotated
   * (no longer accepting), at_capacity when their inbox is full.
   */
  async sendBoop(
    id: string,
    target: BoopReachability,
    intents: readonly number[],
    attachments?: { viewPhrase?: string; contact?: BoopContact },
  ): Promise<void> {
    const client = this.requireClient();
    this.requireSession();
    const entry = this.sentBoops().find((b) => b.id === id);
    if (!entry) throw new Error('This boop was discarded.');
    const persona = this.persona();
    const content = buildBoop(
      'boop',
      { label: persona?.name ?? 'a creature', emoji: persona?.emoji ?? '🥚' },
      intents,
      attachments,
      entry.replyBox,
    );
    await client.postKnock(target.inbox, await sealTo(target.pub, content));
    this.mutateSentBoops((list) =>
      list.map((b) => (b.id === id ? { ...b, status: 'sent' as const } : b)),
    );
    await this.save();
  }

  /**
   * Read my inbox. Knocks that don't open with my key are deleted on the
   * spot — garbage cannot occupy the 16 pending slots for 30 days — and
   * duplicate ciphertexts collapse to one.
   */
  async pollBoops(): Promise<void> {
    const client = this.requireClient();
    const { priv } = this.requireSession();
    const creds = priv.boop;
    if (!creds) return;
    const knocks = await client.listKnocks(creds.inbox, creds.token);
    if (knocks === null) {
      // Rotated away or GC'd — self-heal with the stored credentials.
      await client.createBoopInbox(creds.inbox, creds.token).catch(() => undefined);
      this.incomingBoops.set([]);
      return;
    }
    const seen = new Set<string>();
    const opened: IncomingBoop[] = [];
    for (const knock of knocks) {
      if (seen.has(knock.blob)) {
        void client.deleteKnock(creds.inbox, creds.token, knock.id).catch(() => undefined);
        continue;
      }
      seen.add(knock.blob);
      try {
        const content = migrateBoopContent(await openSealed(creds.priv, knock.blob));
        opened.push({ id: knock.id, created: knock.created, content });
      } catch {
        void client.deleteKnock(creds.inbox, creds.token, knock.id).catch(() => undefined);
      }
    }
    this.incomingBoops.set(opened);
  }

  /**
   * The one reply: sealed under the key that rode inside the knock, dropped
   * into the sender's reply box, and the original knock is deleted — the
   * exchange is complete on our side.
   */
  async replyToBoop(
    boop: IncomingBoop,
    intents: readonly number[],
    attachments?: { viewPhrase?: string; contact?: BoopContact },
  ): Promise<void> {
    const client = this.requireClient();
    this.requireSession();
    const replyBox = boop.content.replyBox;
    if (!replyBox) throw new Error('This boop carries no reply box.');
    const persona = this.persona();
    const content = buildBoop(
      'reply',
      { label: persona?.name ?? 'a creature', emoji: persona?.emoji ?? '🥚' },
      intents,
      attachments,
    );
    await client.postKnock(replyBox.locator, await sealWithKey(replyBox.key, content));
    await this.dismissBoop(boop.id);
  }

  /** Silent decline — deletion is the whole gesture. */
  async dismissBoop(knockId: string): Promise<void> {
    const client = this.requireClient();
    const { priv } = this.requireSession();
    const creds = priv.boop;
    if (creds) await client.deleteKnock(creds.inbox, creds.token, knockId).catch(() => undefined);
    this.incomingBoops.set(this.incomingBoops().filter((b) => b.id !== knockId));
  }

  /**
   * Check every outstanding reply box. A found reply is kept in PrivData
   * and its box torn down; a missing box is re-created from stored creds
   * (the knock may still have gone out — the reply must stay receivable).
   */
  async pollSentBoops(): Promise<void> {
    const client = this.requireClient();
    this.requireSession();
    let changed = false;
    for (const entry of this.sentBoops()) {
      if (entry.status === 'answered') continue;
      const knocks = await client
        .listKnocks(entry.replyBox.locator, entry.replyBox.token)
        .catch(() => null);
      if (knocks === null) {
        await client
          .createBoopInbox(entry.replyBox.locator, entry.replyBox.token)
          .catch(() => undefined);
        continue;
      }
      for (const knock of knocks) {
        try {
          const reply = migrateBoopContent(await openWithKey(entry.replyBox.key, knock.blob));
          this.mutateSentBoops((list) =>
            list.map((b) =>
              b.id === entry.id ? { ...b, status: 'answered' as const, reply } : b,
            ),
          );
          await client
            .deleteBoopInbox(entry.replyBox.locator, entry.replyBox.token)
            .catch(() => undefined);
          changed = true;
          break;
        } catch {
          void client
            .deleteKnock(entry.replyBox.locator, entry.replyBox.token, knock.id)
            .catch(() => undefined);
        }
      }
    }
    if (changed) await this.save();
  }

  /** Forget a sent boop; an unanswered reply box is torn down with it. */
  async removeSentBoop(id: string): Promise<void> {
    const client = this.requireClient();
    const entry = this.sentBoops().find((b) => b.id === id);
    if (!entry) return;
    if (entry.status !== 'answered') {
      await client
        .deleteBoopInbox(entry.replyBox.locator, entry.replyBox.token)
        .catch(() => undefined);
    }
    this.mutateSentBoops((list) => list.filter((b) => b.id !== id));
    await this.save();
  }

  // ---- anonymous metrics --------------------------------------------------

  /**
   * Toggle the anonymous-counter opt-in. Opting IN submits immediately —
   * the person is present and consenting right now, so instant feedback
   * beats a stealth delay; only recurring monthly re-submissions are
   * decoupled from other traffic (see maybeSubmitMetrics).
   */
  async setMetricsOptIn(on: boolean): Promise<void> {
    const { priv } = this.requireSession();
    priv.metricsOptIn = on;
    this.metricsOptIn.set(on);
    await this.save();
    if (on) await this.submitMetricsNow();
  }

  /**
   * Fire the current epoch's submission if opted in and not yet counted.
   * Called on dashboard visits; recurring submissions ride a random 10–90 s
   * delay so they never sit next to a profile save in the server's logs.
   * `metricsLastEpoch` is only persisted by the NEXT organic save — a
   * duplicate submission is rejected harmlessly server-side.
   */
  maybeSubmitMetrics(): void {
    const priv = this.priv;
    if (!priv?.metricsOptIn) return;
    const epoch = currentEpoch(Date.now());
    if (this.submittedEpochs.has(epoch) || priv.metricsLastEpoch === epoch) return;
    const delay = 10_000 + Math.floor(Math.random() * 80_000);
    setTimeout(() => {
      void this.submitMetricsNow().catch(() => undefined);
    }, delay);
    this.submittedEpochs.add(epoch); // scheduled counts as handled for this tab
  }

  private async submitMetricsNow(): Promise<void> {
    const client = this.requireClient();
    const { priv } = this.requireSession();
    const viewPhrase = this.viewPhrase();
    if (!viewPhrase || !priv.metricsOptIn) return;
    const epoch = currentEpoch(Date.now());
    const buckets = buildMetricsBuckets(this.draft.answers());
    if (buckets.length === 0) return; // no age band answered — nothing to say
    try {
      await client.submitMetrics({
        epoch,
        token: await deriveMetricsToken(viewPhrase),
        buckets,
      });
    } catch (err) {
      // Already counted this epoch — exactly the goal.
      if (!(err instanceof HatchError && err.failure.kind === 'conflict')) throw err;
    }
    this.submittedEpochs.add(epoch);
    priv.metricsLastEpoch = epoch; // rides the next organic save
  }

  /** Track a group without depositing (opened someone's invite link). */
  async rememberGroup(rawGroupPhrase: string): Promise<void> {
    this.requireSession();
    const groupPhrase = canonicalViewPhrase(rawGroupPhrase);
    if (this.groups().some((g) => g.groupPhrase === groupPhrase)) return;
    this.mutateGroups((list) => [
      ...list,
      { id: crypto.randomUUID(), groupPhrase, addedAt: Date.now() },
    ]);
    await this.save();
  }

  // ---- internals ----------------------------------------------------------

  private async doSave(): Promise<void> {
    const client = this.requireClient();
    const { editKeys, viewKeys, priv } = this.requireSession();
    this.saveState.set('saving');
    const answers = structuredClone(this.draft.answers()) as Answers;
    const nextPriv: PrivData = {
      ...priv,
      answers,
      weights: structuredClone(this.draft.weights()) as Weights,
      acceptable: structuredClone(this.draft.acceptable()) as Acceptable,
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
        const remotePriv = migratePrivData(
          await decryptBlob(remote.blob_priv, editKeys.editKey),
        );
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
    this.savedAnswers.set(structuredClone(priv.answers) as Answers);
    this.savedWeights.set(structuredClone(priv.weights ?? {}) as Weights);
    this.savedAcceptable.set(structuredClone(priv.acceptable ?? {}) as Acceptable);
  }

  private mutateConnections(fn: (list: readonly SavedConnection[]) => SavedConnection[]): void {
    const { priv } = this.requireSession();
    priv.connections = fn(priv.connections);
    this.connections.set(priv.connections);
  }

  private mutateGroups(
    fn: (list: readonly SavedGroupMembership[]) => SavedGroupMembership[],
  ): void {
    const { priv } = this.requireSession();
    priv.groups = fn(priv.groups ?? []);
    this.groups.set(priv.groups);
  }

  private mutateSentBoops(fn: (list: readonly SentBoop[]) => SentBoop[]): void {
    const { priv } = this.requireSession();
    priv.sentBoops = fn(priv.sentBoops ?? []);
    this.sentBoops.set(priv.sentBoops);
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
