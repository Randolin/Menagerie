import { inject, Injectable } from '@angular/core';
import {
  buildBoop,
  migrateBoopContent,
  mintBoopBoxKey,
  openSealed,
  openWithKey,
  randomLocator,
  randomToken,
  sealTo,
  sealWithKey,
  type BoopContact,
  type BoopReachability,
  type SentBoop,
} from '@moxy/core';
import { ProfileSessionStore, type IncomingBoop } from './profile-session.store';

/**
 * Boop messaging: staging and sending, inbox polling, replies, dismissals.
 * The inbox lifecycle (ensureBoopInbox, rotation on re-mint) stays in
 * ProfileSessionStore — it is welded to login and re-keying — as do the
 * incomingBoops/sentBoops signals, which mirror encrypted PrivData.
 */
@Injectable({ providedIn: 'root' })
export class BoopStore {
  private readonly session = inject(ProfileSessionStore);

  /**
   * Stage a boop toward one recipient: the reply box is minted, persisted
   * (see ensureBoopInbox for why persistence comes first), and registered
   * now — at composer-open — so its creation never sits adjacent to the
   * knock POST in the server's view of time; the human filling in the
   * composer provides the jitter.
   */
  async prepareBoop(label: string, emoji: string): Promise<string> {
    const client = this.session.requireClient();
    this.session.requireSession();
    const entry: SentBoop = {
      id: crypto.randomUUID(),
      label,
      emoji,
      replyBox: { locator: randomLocator(), token: randomToken(), key: mintBoopBoxKey() },
      sentAt: Date.now(),
      status: 'pending',
    };
    this.session.mutateSentBoops((list) => [...list, entry]);
    await this.session.save();
    await client.createBoopInbox(entry.replyBox.locator, entry.replyBox.token);
    return entry.id;
  }

  /** Composer closed without sending: tear the staged reply box down. */
  async discardBoop(id: string): Promise<void> {
    const client = this.session.requireClient();
    const entry = this.session.sentBoops().find((b) => b.id === id);
    if (!entry || entry.status !== 'pending') return;
    await client
      .deleteBoopInbox(entry.replyBox.locator, entry.replyBox.token)
      .catch(() => undefined);
    this.session.mutateSentBoops((list) => list.filter((b) => b.id !== id));
    await this.session.save();
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
    const client = this.session.requireClient();
    this.session.requireSession();
    const entry = this.session.sentBoops().find((b) => b.id === id);
    if (!entry) throw new Error('This boop was discarded.');
    const persona = this.session.persona();
    const content = buildBoop(
      'boop',
      { label: persona?.name ?? 'a creature', emoji: persona?.emoji ?? '🥚' },
      intents,
      attachments,
      entry.replyBox,
    );
    await client.postKnock(target.inbox, await sealTo(target.pub, content));
    this.session.mutateSentBoops((list) =>
      list.map((b) => (b.id === id ? { ...b, status: 'sent' as const } : b)),
    );
    await this.session.save();
  }

  /**
   * Read my inbox. Knocks that don't open with my key are deleted on the
   * spot — garbage cannot occupy the 16 pending slots for 30 days — and
   * duplicate ciphertexts collapse to one.
   */
  async pollBoops(): Promise<void> {
    const client = this.session.requireClient();
    const { priv } = this.session.requireSession();
    const creds = priv.boop;
    if (!creds) return;
    const knocks = await client.listKnocks(creds.inbox, creds.token);
    if (knocks === null) {
      // Rotated away or GC'd — self-heal with the stored credentials.
      await client.createBoopInbox(creds.inbox, creds.token).catch(() => undefined);
      this.session.incomingBoops.set([]);
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
    this.session.incomingBoops.set(opened);
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
    const client = this.session.requireClient();
    this.session.requireSession();
    const replyBox = boop.content.replyBox;
    if (!replyBox) throw new Error('This boop carries no reply box.');
    const persona = this.session.persona();
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
    const client = this.session.requireClient();
    const { priv } = this.session.requireSession();
    const creds = priv.boop;
    if (creds) await client.deleteKnock(creds.inbox, creds.token, knockId).catch(() => undefined);
    this.session.incomingBoops.set(this.session.incomingBoops().filter((b) => b.id !== knockId));
  }

  /**
   * Check every outstanding reply box. A found reply is kept in PrivData
   * and its box torn down; a missing box is re-created from stored creds
   * (the knock may still have gone out — the reply must stay receivable).
   */
  async pollSentBoops(): Promise<void> {
    const client = this.session.requireClient();
    this.session.requireSession();
    let changed = false;
    for (const entry of this.session.sentBoops()) {
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
          this.session.mutateSentBoops((list) =>
            list.map((b) => (b.id === entry.id ? { ...b, status: 'answered' as const, reply } : b)),
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
    if (changed) await this.session.save();
  }

  /** Forget a sent boop; an unanswered reply box is torn down with it. */
  async removeSentBoop(id: string): Promise<void> {
    const client = this.session.requireClient();
    const entry = this.session.sentBoops().find((b) => b.id === id);
    if (!entry) return;
    if (entry.status !== 'answered') {
      await client
        .deleteBoopInbox(entry.replyBox.locator, entry.replyBox.token)
        .catch(() => undefined);
    }
    this.session.mutateSentBoops((list) => list.filter((b) => b.id !== id));
    await this.session.save();
  }
}
