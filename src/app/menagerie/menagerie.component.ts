import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BOOP_INTENTS, CONTACT_PLATFORMS, extractViewPhrase } from '@moxy/core';
import { CreatureIconComponent, ToastService } from '@moxy/ui';
import { BoopComposerComponent } from '../boop/boop-composer.component';
import { CompareStore } from '../stores/compare.store';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { BoopStore } from '../stores/boop.store';

/**
 * Other people: the creatures you keep, and the ones who reached out.
 *
 * Both halves are about someone else, and neither is part of your own profile
 * — which is exactly why they used to make /me feel like a filing cabinet.
 */
@Component({
  selector: 'moxy-menagerie',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BoopComposerComponent, CreatureIconComponent],
  template: `
    <div class="card">
      <h2 i18n>My menagerie</h2>
      <p i18n class="sub">
        The creatures you’ve collected — keep view phrases you’ve been given and compare them
        against your own profile. Your menagerie is encrypted with your edit key; the server never
        sees who’s in it.
      </p>
      @if (session.connections().length) {
        <div style="display:flex;justify-content:flex-end;margin-bottom:6px">
          <button
            class="btn btn-ghost btn-small"
            [disabled]="session.refreshingConnections()"
            (click)="refresh()"
          >
            @if (session.refreshingConnections()) {
              <span i18n>Checking…</span>
            } @else {
              <span i18n>Check for updates</span>
            }
          </button>
        </div>
      }
      @for (c of session.connections(); track c.id) {
        <div class="grid-row" style="align-items:center">
          <div class="grid-item-label">
            {{ c.label }}
            @switch (freshness(c.id)) {
              @case ('updated') {
                <span i18n class="badge badge-close" style="margin-left:6px">new answers</span>
              }
              @case ('gone') {
                <span i18n class="fine" style="margin-left:6px">· no longer opens</span>
              }
            }
          </div>
          <div class="grid-answers" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="fine">{{ c.viewPhrase }}</span>
            <button i18n class="btn btn-small" (click)="compareWith(c.viewPhrase)">Compare</button>
            <a i18n class="btn btn-ghost btn-small" [routerLink]="['/view', c.viewPhrase]">View</a>
            <button
              class="btn btn-ghost btn-small"
              [attr.aria-label]="'Remove ' + c.label"
              (click)="removeConnection(c.id)"
            >
              ✕
            </button>
          </div>
        </div>
      } @empty {
        <p i18n class="fine">
          No creatures yet. Paste a view phrase or link below to keep it here.
        </p>
      }
      <form
        style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"
        (submit)="addConnection($event, nameInput, phraseInput)"
      >
        <input
          #nameInput
          type="text"
          i18n-placeholder
          placeholder="Name (for you only)"
          i18n-aria-label
          aria-label="Connection name"
          style="min-width:150px"
        />
        <input
          #phraseInput
          type="text"
          i18n-placeholder
          placeholder="Their view phrase or link"
          i18n-aria-label
          aria-label="Connection view phrase"
          style="flex:1;min-width:220px"
        />
        <button i18n class="btn">Add</button>
      </form>
    </div>

    <div class="card">
      <h2 i18n>Boops</h2>
      <p i18n class="sub">
        A boop is an anonymous “I’m interested” — sealed so only you can open it, with no message
        box on either side. Everything inside is what the sender <em>says</em>; Menagerie can’t
        verify who booped you.
      </p>
      @for (boop of session.incomingBoops(); track boop.id) {
        <div class="grid-row" style="align-items:flex-start">
          <div class="grid-item-label">
            <span i18n>says it’s from</span>
            <moxy-creature-icon
              [emoji]="boop.content.from.emoji"
              [animal]="boop.content.from.animal ?? null"
              [size]="18"
            />
            {{ boop.content.from.label }}
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
              @for (i of boop.content.intents; track i) {
                <span class="fine">· {{ intentLabel(i) }}</span>
              }
            </div>
          </div>
          <div class="grid-answers" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            @if (boop.content.attachments?.viewPhrase; as phrase) {
              <a i18n class="btn btn-ghost btn-small" [routerLink]="['/view', phrase]"
                >Their profile</a
              >
              <button i18n class="btn btn-ghost btn-small" (click)="compareWith(phrase)">
                Compare
              </button>
            }
            @if (boop.content.attachments?.contact; as contact) {
              @if (revealed().has(boop.id)) {
                <span class="fine">
                  {{ platformLabel(contact.platform) }}:
                  <strong style="user-select:all">{{ contact.handle }}</strong>
                </span>
                <button
                  class="btn btn-ghost btn-small"
                  (click)="copy(contact.handle, 'Handle copied')"
                >
                  📋
                </button>
              } @else {
                <button
                  i18n
                  class="btn btn-ghost btn-small"
                  (click)="reveal(boop.id)"
                  i18n-title
                  title="They chose to de-anonymize themselves to you. Off-platform contact is outside Menagerie's protection — trust it like a stranger's note."
                >
                  Reveal contact card
                </button>
              }
            }
            @if (boop.content.replyBox) {
              <moxy-boop-composer [replyTo]="boop" />
            }
            <button
              i18n
              class="btn btn-ghost btn-small"
              (click)="dismissBoop(boop.id)"
              i18n-title
              title="Silently declines — they are not notified"
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      } @empty {
        <p i18n class="fine">No boops waiting. Booping happens from someone’s profile page.</p>
      }
      @if (session.sentBoops().length > 0) {
        <h3 i18n class="fine" style="margin-top:16px">Sent</h3>
        @for (sent of session.sentBoops(); track sent.id) {
          <div class="grid-row" style="align-items:flex-start">
            <div class="grid-item-label">
              <moxy-creature-icon [emoji]="sent.emoji" [size]="18" /> {{ sent.label }}
              <span class="fine">
                @if (sent.status === 'answered') {
                  <span i18n>↩️ replied</span>
                } @else if (sent.status === 'sent') {
                  <span i18n>sent — no reply yet</span>
                } @else {
                  <span i18n>not sent</span>
                }
              </span>
            </div>
            <div
              class="grid-answers"
              style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"
            >
              @if (sent.reply; as reply) {
                @for (i of reply.intents; track i) {
                  <span class="fine">· {{ intentLabel(i) }}</span>
                }
                @if (reply.attachments?.viewPhrase; as phrase) {
                  <a i18n class="btn btn-ghost btn-small" [routerLink]="['/view', phrase]"
                    >Their profile</a
                  >
                }
                @if (reply.attachments?.contact; as contact) {
                  <span class="fine">
                    {{ platformLabel(contact.platform) }}:
                    <strong style="user-select:all">{{ contact.handle }}</strong>
                  </span>
                  <button
                    class="btn btn-ghost btn-small"
                    (click)="copy(contact.handle, 'Handle copied')"
                  >
                    📋
                  </button>
                }
              }
              <button class="btn btn-ghost btn-small" (click)="removeSentBoop(sent.id)">✕</button>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class MenagerieComponent {
  protected readonly session = inject(ProfileSessionStore);
  private readonly boops = inject(BoopStore);

  private readonly compare = inject(CompareStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  constructor() {
    // Poll on every visit, not just at startup. The shell polls once when a
    // session becomes active so the nav badge is populated from anywhere, but
    // that fires before boops that arrive later — opening this page is the
    // moment a refresh is actually wanted.
    void this.boops.pollBoops().catch(() => undefined);
    void this.boops.pollSentBoops().catch(() => undefined);
    // Same reasoning for kept creatures: this page is where "did they answer
    // anything?" gets asked, and asking on arrival is one round of requests
    // indistinguishable from a visit. Nothing polls in the background.
    void this.session.refreshConnections().catch(() => undefined);
  }

  /** '' when there is nothing to say, so the template can @switch on it. */
  protected freshness(id: string): string {
    const found = this.session.connectionFreshness().get(id);
    return found && found.state !== 'current' && found.state !== 'unknown' ? found.state : '';
  }

  protected async refresh(): Promise<void> {
    try {
      await this.session.refreshConnections();
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected readonly revealed = signal<ReadonlySet<string>>(new Set());

  protected reveal(id: string): void {
    this.revealed.set(new Set([...this.revealed(), id]));
  }

  protected intentLabel(i: number): string {
    return BOOP_INTENTS[i] ?? '';
  }

  protected platformLabel(i: number): string {
    return CONTACT_PLATFORMS[i] ?? 'Elsewhere';
  }

  protected async copy(text: string, okMessage: string): Promise<void> {
    await this.toast.copy(text, okMessage);
  }

  protected async addConnection(
    event: Event,
    nameInput: HTMLInputElement,
    phraseInput: HTMLInputElement,
  ): Promise<void> {
    event.preventDefault();
    const phrase = extractViewPhrase(phraseInput.value);
    if (!phrase) {
      this.toast.show($localize`That doesn’t look like a Menagerie view phrase or link.`, 'error');
      return;
    }
    try {
      await this.session.addConnection(nameInput.value, phrase);
      nameInput.value = '';
      phraseInput.value = '';
      this.toast.show($localize`Saved`);
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected async removeConnection(id: string): Promise<void> {
    try {
      await this.session.removeConnection(id);
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected async dismissBoop(id: string): Promise<void> {
    try {
      await this.boops.dismissBoop(id);
      this.toast.show($localize`Dismissed — they are not notified.`);
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected async removeSentBoop(id: string): Promise<void> {
    try {
      await this.boops.removeSentBoop(id);
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected compareWith(theirPhrase: string): void {
    const mine = this.session.viewPhrase();
    if (mine) this.compare.addPhrase(mine);
    this.compare.addPhrase(theirPhrase);
    void this.router.navigate(['/compare']);
  }
}
