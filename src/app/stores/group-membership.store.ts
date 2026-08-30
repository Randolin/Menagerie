import { inject, Injectable } from '@angular/core';
import {
  buildDeposit,
  canonicalViewPhrase,
  deriveGroupAdminToken,
  deriveGroupReadKeys,
  emptyGroupMeta,
  encryptBlob,
  mintEditPhrase,
  mintPseudonym,
  mintViewPhrase,
  pseudonymEmoji,
  randomLocator,
  randomToken,
  type SavedGroupMembership,
} from '@mng/core';
import { DraftStore } from './draft.store';
import { ProfileSessionStore } from './profile-session.store';

/**
 * Group membership operations: create, deposit, leave, kick, re-mint,
 * delete. The membership list itself is session state — read it from
 * ProfileSessionStore.groups — because it rides in the encrypted PrivData
 * that store owns and saves.
 */
@Injectable({ providedIn: 'root' })
export class GroupMembershipStore {
  private readonly session = inject(ProfileSessionStore);
  private readonly draft = inject(DraftStore);

  /**
   * Mint and register a group. Returns both phrases; the admin phrase is
   * shown once (and kept in PrivData so the creator's login recovers it).
   */
  async createGroup(): Promise<{ groupPhrase: string; adminPhrase: string }> {
    const client = this.session.requireClient();
    this.session.requireSession();
    return this.session.withRemint(async () => {
      const groupPhrase = await mintViewPhrase();
      const adminPhrase = await mintEditPhrase();
      const { groupLocator, groupKey } = await deriveGroupReadKeys(groupPhrase);
      const adminToken = await deriveGroupAdminToken(adminPhrase);
      const blobMeta = await encryptBlob(emptyGroupMeta(Date.now()), groupKey);
      await client.createGroup({ group_locator: groupLocator, blob_meta: blobMeta }, adminToken);
      this.session.mutateGroups((list) => [
        ...list,
        { id: crypto.randomUUID(), groupPhrase, adminPhrase, addedAt: Date.now() },
      ]);
      await this.session.save();
      return { groupPhrase, adminPhrase };
    });
  }

  /**
   * Deposit into a group (join, change tier, or refresh a stale snapshot).
   * Tier 1 shares an answer snapshot under a pseudonym; tier 2 adds the view
   * phrase — creature identity and reach-back for every group-phrase holder.
   */
  async depositToGroup(rawGroupPhrase: string, tier: 1 | 2): Promise<void> {
    const client = this.session.requireClient();
    this.session.requireSession();
    const groupPhrase = canonicalViewPhrase(rawGroupPhrase);
    const { groupLocator, groupKey } = await deriveGroupReadKeys(groupPhrase);
    const existing = this.session.groups().find((g) => g.groupPhrase === groupPhrase);
    const pseudonym = existing?.pseudonym
      ? {
          pseudonym: existing.pseudonym,
          emoji: existing.emoji ?? pseudonymEmoji(existing.pseudonym),
        }
      : mintPseudonym();
    const deposit = buildDeposit(
      tier,
      this.draft.answers(),
      this.draft.weights(),
      this.draft.acceptable(),
      tier === 2 ? (this.session.viewPhrase() ?? undefined) : undefined,
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
        this.session.mutateGroups((list) =>
          list.map((g) =>
            g.id === existing.id
              ? { ...g, tier, pseudonym: pseudonym.pseudonym, emoji: pseudonym.emoji }
              : g,
          ),
        );
        await this.session.save();
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
    this.session.mutateGroups((list) => {
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
    await this.session.save();
  }

  /** Remove my deposit (idempotent if already gone) and forget the group. */
  async leaveGroup(id: string): Promise<void> {
    const client = this.session.requireClient();
    const entry = this.session.groups().find((g) => g.id === id);
    if (!entry) return;
    if (entry.memberLocator && entry.memberToken) {
      const { groupLocator } = await deriveGroupReadKeys(entry.groupPhrase);
      await client.removeMember(groupLocator, entry.memberLocator, entry.memberToken, 'member');
    }
    this.session.mutateGroups((list) => list.filter((g) => g.id !== id));
    await this.session.save();
  }

  /**
   * Re-mint a group I created: every old invite link, QR, and deposit dies;
   * a fresh roster appears under new phrases. Old deposits are cleared first
   * (they'd be sealed under the dead key anyway); my own is re-deposited.
   * Returns the new group phrase.
   */
  async remintGroup(id: string): Promise<string> {
    const client = this.session.requireClient();
    const entry = this.session.groups().find((g) => g.id === id);
    if (!entry?.adminPhrase) throw new Error('Only the group creator can re-mint.');
    const oldAdminToken = await deriveGroupAdminToken(entry.adminPhrase);
    const { groupLocator: oldLocator } = await deriveGroupReadKeys(entry.groupPhrase);
    const roster = await client.getGroup(oldLocator);
    if (!roster) throw new Error('This group no longer exists.');
    for (const member of roster.members) {
      await client.removeMember(oldLocator, member.member_locator, oldAdminToken, 'admin');
    }
    return this.session.withRemint(async () => {
      const groupPhrase = await mintViewPhrase();
      const adminPhrase = await mintEditPhrase();
      const { groupLocator, groupKey } = await deriveGroupReadKeys(groupPhrase);
      const adminToken = await deriveGroupAdminToken(adminPhrase);
      const blobMeta = await encryptBlob(emptyGroupMeta(Date.now()), groupKey);
      await client.putGroup(
        oldLocator,
        oldAdminToken,
        roster.version,
        { blob_meta: blobMeta, new_group_locator: groupLocator },
        adminToken,
      );
      const hadDeposit = Boolean(entry.memberLocator);
      const tier = entry.tier ?? 1;
      this.session.mutateGroups((list) =>
        list.map((g) =>
          g.id === id
            ? { ...g, groupPhrase, adminPhrase, memberLocator: undefined, memberToken: undefined }
            : g,
        ),
      );
      await this.session.save();
      if (hadDeposit) await this.depositToGroup(groupPhrase, tier);
      return groupPhrase;
    });
  }

  /** Admin-only: remove one member's deposit (they can rejoin until re-mint). */
  async kickMember(adminPhrase: string, groupPhrase: string, memberLocator: string): Promise<void> {
    const client = this.session.requireClient();
    const adminToken = await deriveGroupAdminToken(adminPhrase);
    const { groupLocator } = await deriveGroupReadKeys(groupPhrase);
    await client.removeMember(groupLocator, memberLocator, adminToken, 'admin');
  }

  /** Admin-only: delete the group and every deposit, then forget it locally. */
  async deleteGroup(entryId: string, adminPhrase: string, groupPhrase: string): Promise<void> {
    const client = this.session.requireClient();
    const adminToken = await deriveGroupAdminToken(adminPhrase);
    const { groupLocator } = await deriveGroupReadKeys(groupPhrase);
    await client.removeGroup(groupLocator, adminToken);
    await this.leaveGroup(entryId);
  }
}
