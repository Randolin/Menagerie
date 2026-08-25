import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BOOP_INTENTS, CONTACT_PLATFORMS, extractViewPhrase } from '@moxy/core';
import { CreatureIconComponent, ToastService } from '@moxy/ui';
import { BoopComposerComponent } from '../boop/boop-composer.component';
import { CompareStore } from '../stores/compare.store';
import { ProfileSessionStore } from '../stores/profile-session.store';

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
      <h2>My menagerie</h2>
      <p class="sub">
        The creatures you’ve collected — keep view phrases you’ve been given and compare them
        against your own profile. Your menagerie is encrypted with your edit key; the server never
        sees who’s in it.
      </p>
      @for (c of session.connections(); track c.id) {
        <div class="grid-row" style="align-items:center">
          <div class="grid-item-label">{{ c.label }}</div>
          <div class="grid-answers" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="fine">{{ c.viewPhrase }}</span>
            <button class="btn btn-small" (click)="compareWith(c.viewPhrase)">Compare</button>
            <a class="btn btn-ghost btn-small" [routerLink]="['/view', c.viewPhrase]">View</a>
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
        <p class="fine">No creatures yet. Paste a view phrase or link below to keep it here.</p>
      }
      <form
        style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"
        (submit)="addConnection($event, nameInput, phraseInput)"
      >
        <input
          #nameInput
          type="text"
          placeholder="Name (for you only)"
          aria-label="Connection name"
          style="min-width:150px"
        />
        <input
          #phraseInput
          type="text"
          placeholder="Their view phrase or link"
          aria-label="Connection view phrase"
          style="flex:1;min-width:220px"
        />
        <button class="btn">Add</button>
      </form>
    </div>

    <div class="card">
      <h2>Boops</h2>
      <p class="sub">
        A boop is an anonymous “I’m interested” — sealed so only you can open it, with no message
        box on either side. Everything inside is what the sender <em>says</em>; Menagerie can’t
        verify who booped you.
      </p>
      @for (boop of session.incomingBoops(); track boop.id) {
        <div class="grid-row" style="align-items:flex-start">
          <div class="grid-item-label">
            says it’s from <moxy-creature-icon [emoji]="boop.content.from.emoji" [size]="18" />
            {{ boop.content.from.label }}
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
              @for (i of boop.content.intents; track i) {
                <span class="fine">· {{ intentLabel(i) }}</span>
              }
            </div>
          </div>
          <div class="grid-answers" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            @if (boop.content.attachments?.viewPhrase; as phrase) {
              <a class="btn btn-ghost btn-small" [routerLink]="['/view', phrase]">Their profile</a>
              <button class="btn btn-ghost btn-small" (click)="compareWith(phrase)">Compare</button>
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
                  class="btn btn-ghost btn-small"
                  (click)="reveal(boop.id)"
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
              class="btn btn-ghost btn-small"
              (click)="dismissBoop(boop.id)"
              title="Silently declines — they are not notified"
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      } @empty {
        <p class="fine">No boops waiting. Booping happens from someone’s profile page.</p>
      }
      @if (session.sentBoops().length > 0) {
        <h3 class="fine" style="margin-top:16px">Sent</h3>
        @for (sent of session.sentBoops(); track sent.id) {
          <div class="grid-row" style="align-items:flex-start">
            <div class="grid-item-label">
              <moxy-creature-icon [emoji]="sent.emoji" [size]="18" /> {{ sent.label }}
              <span class="fine">
                {{
                  sent.status === 'answered'
                    ? '↩️ replied'
                    : sent.status === 'sent'
                      ? 'sent — no reply yet'
                      : 'not sent'
                }}
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
                  <a class="btn btn-ghost btn-small" [routerLink]="['/view', phrase]"
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

  private readonly compare = inject(CompareStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  constructor() {
    // Poll on every visit, not just at startup. The shell polls once when a
    // session becomes active so the nav badge is populated from anywhere, but
    // that fires before boops that arrive later — opening this page is the
    // moment a refresh is actually wanted.
    void this.session.pollBoops().catch(() => undefined);
    void this.session.pollSentBoops().catch(() => undefined);
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

  protected copy(text: string, okMessage: string): Promise<void> {
    return this.toast.copy(text, okMessage);
  }

  protected async addConnection(
    event: Event,
    nameInput: HTMLInputElement,
    phraseInput: HTMLInputElement,
  ): Promise<void> {
    event.preventDefault();
    const phrase = extractViewPhrase(phraseInput.value);
    if (!phrase) {
      this.toast.show('That doesn’t look like a Menagerie view phrase or link.', 'error');
      return;
    }
    try {
      await this.session.addConnection(nameInput.value, phrase);
      nameInput.value = '';
      phraseInput.value = '';
      this.toast.show('Saved');
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
      await this.session.dismissBoop(id);
      this.toast.show('Dismissed — they are not notified.');
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected async removeSentBoop(id: string): Promise<void> {
    try {
      await this.session.removeSentBoop(id);
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
