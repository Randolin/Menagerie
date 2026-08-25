import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  BOOP_INTENTS,
  CONTACT_PLATFORMS,
  CONTACT_HANDLE_MAX,
  HatchError,
  validContactHandle,
  type BoopReachability,
} from '@moxy/core';
import { ToastService, errorText } from '@moxy/ui';
import { ProfileSessionStore, type IncomingBoop } from '../stores/profile-session.store';
import { BoopStore } from '../stores/boop.store';

type Phase = 'idle' | 'staging' | 'composing' | 'sending' | 'done';

/**
 * The one composer for first contact and for the single reply. Structured
 * only: intents from the fixed list, optional view phrase, optional contact
 * card — each reveal behind its own advisory. In send mode the reply box is
 * staged the moment the composer opens (see BoopStore.prepareBoop
 * for the timing rationale).
 */
@Component({
  selector: 'moxy-boop-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    @switch (phase()) {
      @case ('idle') {
        <button class="btn btn-primary" (click)="open()">
          {{ replyTo() ? '↩️ Reply once' : '👉 Boop' }}
        </button>
      }
      @case ('staging') {
        <button class="btn" disabled>Preparing…</button>
      }
      @case ('done') {
        <p class="sub">
          {{
            replyTo()
              ? 'Reply sent — this exchange is complete.'
              : 'Booped! If they’re
          interested, their one reply will appear on your dashboard.'
          }}
        </p>
      }
      @default {
        <div class="boop-form">
          <p class="sub" style="margin-bottom:8px">
            {{
              replyTo()
                ? 'One reply, then the channel closes. Share only what you choose to.'
                : 'A boop says “I’m interested” — no message box, no pressure. They can reply
                 once or quietly decline; you won’t be notified either way.'
            }}
          </p>
          <fieldset class="boop-intents">
            <legend class="fine">What are you hoping for?</legend>
            @for (intent of intents; track $index) {
              <label class="boop-check">
                <input
                  type="checkbox"
                  [checked]="chosen().has($index)"
                  (change)="toggleIntent($index)"
                />
                {{ intent }}
              </label>
            }
          </fieldset>

          @if (canAttachViewPhrase()) {
            <label class="boop-check" style="margin-top:10px">
              <input
                type="checkbox"
                [checked]="attachView()"
                (change)="attachView.set(!attachView())"
              />
              Include my view phrase
            </label>
            @if (attachView()) {
              <p class="fine">
                They’ll see your full open profile and can boop you back. Your creature stays
                anonymous — but a shared view phrase can’t be unshared (regenerating your creature
                is the only undo).
              </p>
            }
          }

          <label class="boop-check" style="margin-top:6px">
            <input
              type="checkbox"
              [checked]="attachContact()"
              (change)="attachContact.set(!attachContact())"
            />
            Include a contact card
          </label>
          @if (attachContact()) {
            <p class="fine boop-warn">
              ⚠️ A contact card leaves Menagerie’s protection: it ties this boop to who you are on
              another platform, permanently, for this person. Menagerie can’t take it back, and
              can’t verify who reads it.
            </p>
            <div class="btn-row" style="align-items:center;gap:8px">
              <select #platformSel (change)="platform.set(platformSel.selectedIndex)">
                @for (p of platforms; track $index) {
                  <option [selected]="$index === platform()">{{ p }}</option>
                }
              </select>
              <input
                type="text"
                [attr.maxlength]="handleMax"
                placeholder="your handle"
                [value]="handle()"
                #handleInput
                (input)="handle.set(handleInput.value)"
              />
            </div>
            <label class="boop-check">
              <input
                type="checkbox"
                [checked]="contactConfirmed()"
                (change)="contactConfirmed.set(!contactConfirmed())"
              />
              I understand this de-anonymizes me to this person
            </label>
          }

          @if (error(); as msg) {
            <p class="fine boop-warn">{{ msg }}</p>
          }
          <div class="btn-row" style="margin-top:12px">
            <button
              class="btn btn-primary"
              [disabled]="!canSend() || phase() === 'sending'"
              (click)="send()"
            >
              {{ phase() === 'sending' ? 'Sending…' : replyTo() ? 'Send reply' : 'Send boop' }}
            </button>
            <button class="btn btn-ghost" [disabled]="phase() === 'sending'" (click)="cancel()">
              Cancel
            </button>
          </div>
        </div>
      }
    }
  `,
  styles: `
    .boop-form {
      margin-top: 8px;
    }
    .boop-intents {
      border: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 4px;
    }
    .boop-check {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .boop-warn {
      color: var(--warn, #b45309);
    }
  `,
})
export class BoopComposerComponent {
  private readonly toast = inject(ToastService);
  protected readonly session = inject(ProfileSessionStore);
  private readonly boops = inject(BoopStore);

  /** Send mode: where the boop goes (from the recipient's view payload). */
  readonly target = input<BoopReachability | null>(null);
  /** Reply mode: the incoming boop being answered. */
  readonly replyTo = input<IncomingBoop | null>(null);
  /** Recipient's claimed label + emoji, for the sent-boops ledger. */
  readonly label = input('a creature');
  readonly emoji = input('🥚');

  protected readonly intents = BOOP_INTENTS;
  protected readonly platforms = CONTACT_PLATFORMS;
  protected readonly handleMax = CONTACT_HANDLE_MAX;

  protected readonly phase = signal<Phase>('idle');
  protected readonly chosen = signal<ReadonlySet<number>>(new Set());
  protected readonly attachView = signal(false);
  protected readonly attachContact = signal(false);
  protected readonly contactConfirmed = signal(false);
  protected readonly platform = signal(0);
  protected readonly handle = signal('');
  protected readonly error = signal<string | null>(null);
  private stagedId: string | null = null;

  /** Replying to a boop that already carries our view phrase re-offering it is noise. */
  protected canAttachViewPhrase(): boolean {
    return this.session.viewPhrase() !== null;
  }

  protected readonly canSend = computed(() => {
    if (this.chosen().size === 0) return false;
    if (!this.attachContact()) return true;
    return this.contactConfirmed() && validContactHandle(this.handle().trim());
  });

  protected toggleIntent(i: number): void {
    const next = new Set(this.chosen());
    if (next.has(i)) next.delete(i);
    else next.add(i);
    this.chosen.set(next);
  }

  protected async open(): Promise<void> {
    this.error.set(null);
    if (this.replyTo()) {
      this.phase.set('composing');
      return;
    }
    this.phase.set('staging');
    try {
      this.stagedId = await this.boops.prepareBoop(this.label(), this.emoji());
      this.phase.set('composing');
    } catch (err) {
      this.phase.set('idle');
      this.toast.error(err);
    }
  }

  protected async cancel(): Promise<void> {
    this.phase.set('idle');
    if (this.stagedId) {
      const staged = this.stagedId;
      this.stagedId = null;
      await this.boops.discardBoop(staged).catch(() => undefined);
    }
  }

  protected async send(): Promise<void> {
    this.error.set(null);
    this.phase.set('sending');
    const attachments = {
      viewPhrase: this.attachView() ? (this.session.viewPhrase() ?? undefined) : undefined,
      contact: this.attachContact()
        ? { platform: this.platform(), handle: this.handle().trim() }
        : undefined,
    };
    try {
      const reply = this.replyTo();
      if (reply) {
        await this.boops.replyToBoop(reply, [...this.chosen()], attachments);
        // Success removes the boop's row — and this composer with it — so
        // the confirmation must outlive us as a toast.
        this.toast.show('Reply sent — this exchange is complete.');
      } else {
        const target = this.target();
        if (!target || !this.stagedId) throw new Error('Nothing to send to.');
        await this.boops.sendBoop(this.stagedId, target, [...this.chosen()], attachments);
        this.stagedId = null;
      }
      this.phase.set('done');
    } catch (err) {
      this.phase.set('composing');
      if (err instanceof HatchError && err.failure.kind === 'not_found') {
        this.error.set('This creature is no longer accepting boops at this address.');
      } else if (err instanceof HatchError && err.failure.kind === 'at_capacity') {
        this.error.set('Their hatch is full right now — try again another day.');
      } else if (err instanceof HatchError && err.failure.kind === 'rate_limited') {
        this.error.set('This hatch has heard a lot of knocking lately — try again later.');
      } else {
        this.error.set(errorText(err));
      }
    }
  }
}
