import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  buildSharePayload,
  canonicalViewPhrase,
  decryptBlob,
  deriveGroupReadKeys,
  groupUrlFor,
  isViewPhraseShaped,
  migrateDeposit,
  migrateGroupMeta,
  pairScores,
  personaFromViewPhrase,
  type GroupDeposit,
  type Persona,
  type ProfilePayload,
} from '@mng/core';
import {
  CreatureIconComponent,
  MAX_COMPARE,
  QrCodeComponent,
  SubjectCardComponent,
  ToastService,
  errorText,
} from '@mng/ui';
import { CompareStore } from '../stores/compare.store';
import { DraftStore } from '../stores/draft.store';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { ServerConfigStore } from '../stores/server-config.store';
import { GroupMembershipStore } from '../stores/group-membership.store';

interface MemberRow {
  readonly memberLocator: string;
  readonly deposit: GroupDeposit | null;
  readonly persona: Persona | null;
  readonly name: string;
  readonly emoji: string | null;
  readonly isMe: boolean;
}

interface LoadedGroup {
  readonly phrase: string;
  readonly persona: Persona | null;
  readonly members: readonly MemberRow[];
}

/**
 * A group roster: the group's own creature, everyone's deposits, match
 * percentages against the signed-in profile, and join/manage controls.
 * All decryption and comparison happens in this tab.
 */
@Component({
  selector: 'mng-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CreatureIconComponent, QrCodeComponent, SubjectCardComponent],
  template: `
    @if (view.error()) {
      <div class="card">
        <h2 i18n>Couldn’t open that group</h2>
        <p class="sub">{{ errorMessage() }}</p>
        <a i18n class="btn" routerLink="/">Go to the start</a>
      </div>
    } @else if (view.value(); as g) {
      <mng-subject-card
        [persona]="g.persona"
        [phrase]="g.phrase"
        [title]="g.persona?.name ?? unnamedGroup"
      >
        <span i18n subject-head class="fine">group</span>
        <p i18n class="sub">
          A shared roster, stored only as ciphertext. Everyone holding this group’s phrase sees the
          same members: open members as their creature, others as a group-local pseudonym with an
          answer snapshot.
        </p>
        <div class="share-grid">
          <div>
            <div class="code-box">{{ g.phrase }}</div>
            <div class="btn-row" style="margin-top:12px">
              <button
                i18n
                class="btn btn-primary"
                (click)="copy(inviteUrl(g), 'Invite link copied')"
              >
                📋 Copy invite link
              </button>
            </div>
          </div>
          <mng-qr-code [text]="inviteUrl(g)" [persona]="g.persona" />
        </div>
      </mng-subject-card>

      <div class="card">
        <h2 i18n>Members ({{ g.members.length }})</h2>
        @if (g.members.length === 0) {
          <p i18n class="sub">Nobody has deposited yet — share the invite link.</p>
        }
        @for (m of g.members; track m.memberLocator) {
          <div class="grid-row" style="align-items:center">
            <div class="grid-item-label">
              @if (m.deposit) {
                <label style="display:flex;gap:8px;align-items:center">
                  @if (!m.isMe) {
                    <input
                      type="checkbox"
                      [checked]="selected().has(m.memberLocator)"
                      (change)="toggleSelect(m.memberLocator)"
                      [attr.aria-label]="selectLabel(m.name)"
                    />
                  }
                  <span style="display:inline-flex;align-items:center;gap:5px"
                    ><mng-creature-icon [emoji]="m.emoji ?? '🥚'" [size]="18" /> {{ m.name }}</span
                  >
                  @if (m.isMe) {
                    <span i18n class="fine">(you)</span>
                  }
                  @if (m.deposit.tier === 1) {
                    <span i18n class="fine">pseudonym</span>
                  }
                </label>
              } @else {
                <span i18n class="fine"
                  >🥀 sealed deposit — from before a re-mint; ask them to rejoin</span
                >
              }
            </div>
            <div
              class="grid-answers"
              style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"
            >
              @if (m.deposit && !m.isMe && matchPct(m); as pct) {
                <span i18n class="fine">{{ pct }}% overall match with you</span>
              }
              @if (m.deposit?.tier === 2 && m.deposit!.viewPhrase) {
                <a
                  i18n
                  class="btn btn-ghost btn-small"
                  [routerLink]="['/view', m.deposit!.viewPhrase]"
                  >View</a
                >
                @if (session.active() && !m.isMe) {
                  <a
                    i18n
                    class="btn btn-ghost btn-small"
                    [routerLink]="['/view', m.deposit!.viewPhrase]"
                    i18n-title
                    title="Boop from their profile page"
                    >👉 Boop</a
                  >
                }
              } @else if (m.deposit?.tier === 1 && !m.isMe) {
                <span
                  i18n
                  class="fine"
                  i18n-title
                  title="Pseudonymous members can’t be reached in this version"
                >
                  not boopable
                </span>
              }
              @if (isAdmin() && !m.isMe) {
                <button i18n class="btn btn-ghost btn-small" (click)="kick(g, m)">✕ Kick</button>
              }
            </div>
          </div>
        }
        @if (selectedCount() > 0) {
          <div class="btn-row" style="margin-top:12px">
            <button i18n class="btn btn-primary" (click)="compareSelected(g)">
              🔍 Compare
              @if (session.active()) {
                me +
              }
              {{ selectedCount() }} selected
            </button>
          </div>
        }
      </div>

      @if (session.active()) {
        <div class="card">
          <h2>
            @if (myMembership()?.memberLocator) {
              <span i18n>My membership</span>
            } @else {
              <span i18n>Join this group</span>
            }
          </h2>
          <p i18n class="sub">
            Joining deposits a copy of your open answers into the roster — desires never, in any
            form. Pseudonymous keeps your creature and view link out of it; open shares both with
            everyone who ever holds this group’s phrase. Deposits are snapshots: refresh after you
            change answers.
          </p>
          <div class="btn-row">
            <button class="btn" [disabled]="busy()" (click)="deposit(g, 1)">
              @if (!myMembership()?.memberLocator) {
                <span i18n>🐾 Join with a pseudonym</span>
              } @else if (myMembership()?.tier === 1) {
                <span i18n>↻ Refresh (pseudonymous)</span>
              } @else {
                <span i18n>Switch to pseudonymous</span>
              }
            </button>
            <button class="btn" [disabled]="busy()" (click)="deposit(g, 2)">
              @if (!myMembership()?.memberLocator) {
                <span i18n>🦊 Join openly</span>
              } @else if (myMembership()?.tier === 2) {
                <span i18n>↻ Refresh (open)</span>
              } @else {
                <span i18n>Open up — share my creature</span>
              }
            </button>
            @if (myMembership()?.memberLocator) {
              <button i18n class="btn btn-ghost" [disabled]="busy()" (click)="leave()">
                Leave group
              </button>
            }
          </div>
        </div>
      } @else {
        <div class="card">
          <p i18n class="sub">
            <a routerLink="/">Hatch or log in</a> to join this group and see how you match its
            members.
          </p>
        </div>
      }

      @if (isAdmin()) {
        <div class="card">
          <h2 i18n>Group admin</h2>
          <p i18n class="sub">
            You hold this group’s admin phrase. Kicking removes a deposit; it does NOT revoke the
            group phrase — someone who has it can still read the roster until you re-mint.
            Re-minting kills every old link, QR, and deposit.
          </p>
          <div class="btn-row">
            <button i18n class="btn" [disabled]="busy()" (click)="remint()">
              🎲 Re-mint group
            </button>
            <button i18n class="btn btn-danger" [disabled]="busy()" (click)="deleteGroup(g)">
              Delete group forever
            </button>
          </div>
        </div>
      }
    } @else {
      <div class="card"><p i18n class="sub">Opening group…</p></div>
    }
  `,
})
export class GroupComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly config = inject(ServerConfigStore);
  private readonly compare = inject(CompareStore);
  private readonly draft = inject(DraftStore);
  protected readonly session = inject(ProfileSessionStore);
  private readonly groupStore = inject(GroupMembershipStore);
  private readonly toast = inject(ToastService);

  private readonly params = toSignal(this.route.params, {
    initialValue: this.route.snapshot.params,
  });
  private readonly phrase = computed(() =>
    canonicalViewPhrase(String(this.params()['phrase'] ?? '')),
  );
  private readonly reload = signal(0);
  protected readonly busy = signal(false);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // This route is unguarded (invite links deep-link here); pick the
    // session back up so membership, match %, and admin controls appear.
    void this.session.restore();
  }

  protected readonly myMembership = computed(() =>
    this.session.groups().find((g) => g.groupPhrase === this.phrase()),
  );
  protected readonly isAdmin = computed(() => Boolean(this.myMembership()?.adminPhrase));

  protected readonly view = resource({
    params: () => ({
      phrase: this.phrase(),
      state: this.config.state(),
      tick: this.reload(),
      // Reload when my membership changes (join/leave/tier switch).
      me: this.myMembership()?.memberLocator ?? '',
    }),
    loader: async ({ params }): Promise<LoadedGroup> => {
      if (params.state === 'loading') return new Promise<never>(() => undefined);
      const client = this.config.client();
      if (!client) throw new Error('No profile server is configured.');
      if (!isViewPhraseShaped(params.phrase)) {
        throw new Error('That’s not a valid Menagerie group phrase.');
      }
      const { groupLocator, groupKey } = await deriveGroupReadKeys(params.phrase);
      const record = await client.getGroup(groupLocator);
      if (!record) {
        throw new Error('No group answers to that phrase. It may have been re-minted or deleted.');
      }
      migrateGroupMeta(await decryptBlob(record.blob_meta, groupKey));
      const mine = this.myMembership()?.memberLocator;
      const members = await Promise.all(
        record.members.map(async (m): Promise<MemberRow> => {
          try {
            const deposit = migrateDeposit(await decryptBlob(m.blob_member, groupKey));
            const persona =
              deposit.tier === 2 && deposit.viewPhrase
                ? await personaFromViewPhrase(deposit.viewPhrase)
                : null;
            return {
              memberLocator: m.member_locator,
              deposit,
              persona,
              name: persona?.name ?? deposit.pseudonym,
              emoji: persona?.emoji ?? deposit.emoji,
              isMe: m.member_locator === mine,
            };
          } catch {
            return {
              memberLocator: m.member_locator,
              deposit: null,
              persona: null,
              name: 'sealed',
              emoji: null,
              isMe: m.member_locator === mine,
            };
          }
        }),
      );
      return {
        phrase: params.phrase,
        persona: await personaFromViewPhrase(params.phrase),
        members,
      };
    },
  });

  /** My current answers as a payload, for local match percentages. */
  private readonly myPayload = computed<ProfilePayload | null>(() => {
    if (!this.session.active()) return null;
    return buildSharePayload(
      this.draft.answers(),
      [],
      null,
      this.draft.weights(),
      this.draft.acceptable(),
    );
  });

  protected errorMessage(): string {
    return errorText(this.view.error());
  }

  protected inviteUrl(g: LoadedGroup): string {
    return groupUrlFor(g.phrase);
  }

  protected matchPct(m: MemberRow): number | null {
    const mine = this.myPayload();
    if (!mine || !m.deposit) return null;
    const overall = pairScores(mine, m.deposit.snapshot).overall;
    return overall === null ? null : Math.round(overall * 100);
  }

  protected selectedCount(): number {
    return this.selected().size;
  }

  /** Copy in bindings — no `i18n-` form exists, so `$localize` it here. */
  protected readonly unnamedGroup = $localize`A group`;

  protected selectLabel(name: string): string {
    return $localize`Select ${name}:NAME:`;
  }

  protected toggleSelect(memberLocator: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(memberLocator)) next.delete(memberLocator);
      // Me plus the selection must fit the comparison cap.
      else if (next.size < MAX_COMPARE - 1) next.add(memberLocator);
      return next;
    });
  }

  protected compareSelected(g: LoadedGroup): void {
    this.compare.clear();
    const mine = this.session.viewPhrase();
    if (mine) this.compare.addPhrase(mine);
    for (const m of g.members) {
      if (!this.selected().has(m.memberLocator) || !m.deposit) continue;
      if (m.deposit.tier === 2 && m.deposit.viewPhrase) {
        this.compare.addPhrase(m.deposit.viewPhrase);
      } else {
        this.compare.addPayload(m.deposit.snapshot, m.deposit.pseudonym, m.deposit.emoji);
      }
    }
    void this.router.navigate(['/compare']);
  }

  protected async deposit(g: LoadedGroup, tier: 1 | 2): Promise<void> {
    this.busy.set(true);
    try {
      await this.groupStore.depositToGroup(g.phrase, tier);
      this.toast.show(
        tier === 1 ? $localize`Deposited under your pseudonym` : $localize`Deposited openly`,
      );
      this.reload.update((n) => n + 1);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async leave(): Promise<void> {
    const entry = this.myMembership();
    if (!entry) return;
    this.busy.set(true);
    try {
      await this.groupStore.leaveGroup(entry.id);
      this.toast.show($localize`Left the group — your deposit is gone`);
      this.reload.update((n) => n + 1);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async kick(g: LoadedGroup, m: MemberRow): Promise<void> {
    const entry = this.myMembership();
    if (!entry?.adminPhrase) return;
    if (!confirm($localize`Remove ${m.name}:NAME:'s deposit? They can rejoin until you re-mint.`))
      return;
    this.busy.set(true);
    try {
      await this.groupStore.kickMember(entry.adminPhrase, g.phrase, m.memberLocator);
      this.toast.show($localize`${m.name}:NAME: removed`);
      this.reload.update((n) => n + 1);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async remint(): Promise<void> {
    const entry = this.myMembership();
    if (!entry) return;
    if (
      !confirm(
        'Re-mint this group? Every shared link, QR, and deposit dies; members must rejoin via the new invite.',
      )
    )
      return;
    this.busy.set(true);
    try {
      const newPhrase = await this.groupStore.remintGroup(entry.id);
      this.toast.show($localize`Group re-minted — share the new invite`);
      await this.router.navigate(['/group', newPhrase]);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async deleteGroup(g: LoadedGroup): Promise<void> {
    const entry = this.myMembership();
    if (!entry?.adminPhrase) return;
    if (!confirm($localize`Delete this group and every deposit forever?`)) return;
    this.busy.set(true);
    try {
      await this.groupStore.deleteGroup(entry.id, entry.adminPhrase, g.phrase);
      this.toast.show($localize`Group deleted`);
      await this.router.navigate(['/me']);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(text: string, okMessage: string): Promise<void> {
    await this.toast.copy(text, okMessage);
  }
}
