import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { generatePassphrase } from '@moxy/core';
import { QrCodeComponent, ToastService, copyText } from '@moxy/ui';
import { DraftStore } from '../stores/draft.store';
import { VaultStore } from '../stores/vault.store';
import { ShareLinkService } from '../share-link.service';
import { UnlockFormComponent } from './unlock-form.component';

type VaultCardMode = 'closed' | 'passphrase-shown' | 'unlock';

@Component({
  selector: 'moxy-share',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, QrCodeComponent, UnlockFormComponent],
  template: `
    @if (!draft.hasAnswers()) {
      <div class="card">
        <h2>Nothing to share yet</h2>
        <p class="sub">Fill out at least part of the survey first.</p>
        <a class="btn btn-primary" routerLink="/survey">Go to the survey</a>
      </div>
    } @else if (link.value(); as l) {
      <div class="card">
        <h2>Your shareable profile</h2>
        <p class="sub">
          {{ l.openCount }} answer{{ l.openCount === 1 ? '' : 's' }}
          travel{{ l.openCount === 1 ? 's' : '' }} openly in this link{{
            l.desireCount
              ? ', and ' + l.desireCount + ' desire' + (l.desireCount === 1 ? '' : 's') +
                ' travel' + (l.desireCount === 1 ? 's' : '') +
                ' as scrambled, mutual-reveal-only fingerprints.'
              : '.'
          }}
          The link itself is the profile — nothing is uploaded anywhere. Anyone you give it
          to can see the open answers, so share it like you’d share a business card.
        </p>
        <div class="share-grid">
          <div>
            <div class="code-box">{{ l.url }}</div>
            <div class="btn-row" style="margin-top:12px">
              <button class="btn btn-primary" (click)="copy(l.url, 'Link copied')">📋 Copy link</button>
              <button class="btn" (click)="copy(l.code, 'Code copied')">Copy just the code</button>
              <a class="btn btn-ghost" routerLink="/survey">Edit answers</a>
            </div>
            <p class="fine" style="margin-top:10px">
              Each time you open this page the link is re-generated with a fresh scramble, so
              separately shared links can’t be matched to each other.
            </p>
          </div>
          <moxy-qr-code [text]="l.url" />
        </div>
      </div>

      <div class="card">
        @if (vault.unlocked()) {
          <h2>Save to your vault</h2>
          <p class="sub">Your vault is unlocked. Save this profile so you can edit it later.</p>
          <div class="field">
            <span class="field-label">Save as</span>
            <input #saveName type="text" [value]="defaultLabel()" aria-label="Profile name in vault">
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" (click)="saveProfile(saveName.value)">
              {{ draft.editingProfileId() ? 'Update saved profile' : 'Save profile' }}
            </button>
            <a class="btn btn-ghost" routerLink="/vault">Open vault</a>
          </div>
        } @else {
          @switch (mode()) {
            @case ('closed') {
              <h2>Want to come back and edit later?</h2>
              <p class="sub">
                Create a vault: we generate a random passphrase, and your profile is encrypted
                with it on this device. The passphrase is shown once, stored nowhere, and is
                the only way in. It is completely separate from your share link — the link can
                never unlock your vault.
              </p>
              <div class="btn-row">
                <button class="btn btn-primary" (click)="generate()">🔑 Generate my passphrase</button>
                <button class="btn btn-ghost" (click)="mode.set('unlock')">I already have a passphrase</button>
              </div>
            }
            @case ('passphrase-shown') {
              <h2>Your passphrase — write it down now</h2>
              <p class="sub">
                This is the only time it will ever be shown. It is not stored anywhere, not
                even encrypted. If you lose it, the vault cannot be recovered by anyone.
              </p>
              <div class="passphrase-box">{{ passphrase() }}</div>
              <div class="btn-row">
                <button class="btn" (click)="copy(passphrase()!, 'Copied — now store it somewhere safe')">
                  📋 Copy passphrase
                </button>
                <button class="btn btn-primary" (click)="createVault()">
                  I’ve saved it — create my vault
                </button>
              </div>
            }
            @case ('unlock') {
              <h2>Unlock your vault</h2>
              <moxy-unlock-form [busy]="unlocking()" (passphrase)="unlock($event)" />
            }
          }
        }
      </div>
    }
  `,
})
export class ShareComponent {
  protected readonly draft = inject(DraftStore);
  protected readonly vault = inject(VaultStore);
  private readonly shareLink = inject(ShareLinkService);
  private readonly toast = inject(ToastService);

  // Fresh salt every time this view loads — the unlinkability property.
  protected readonly link = resource({
    params: () => this.draft.answers(),
    loader: ({ params }) => this.shareLink.encode(params),
  });

  protected readonly mode = signal<VaultCardMode>('closed');
  protected readonly passphrase = signal<string | null>(null);
  protected readonly unlocking = signal(false);

  protected readonly defaultLabel = computed(() => {
    const name = this.draft.answers()['ab.name'];
    return typeof name === 'string' && name.trim() ? name.trim() : 'My profile';
  });

  protected async copy(text: string, okMessage: string): Promise<void> {
    this.toast.show((await copyText(text)) ? okMessage : 'Copy failed — select it manually');
  }

  protected async generate(): Promise<void> {
    this.passphrase.set(await generatePassphrase(5));
    this.mode.set('passphrase-shown');
  }

  protected async createVault(): Promise<void> {
    const pass = this.passphrase();
    if (!pass) return;
    await this.vault.open(pass, { createIfMissing: true });
    await this.vault.saveProfile(this.defaultLabel(), this.draft.answers());
    this.passphrase.set(null);
    this.toast.show('Vault created and profile saved');
  }

  protected async unlock(pass: string): Promise<void> {
    this.unlocking.set(true);
    try {
      if (await this.vault.open(pass)) this.toast.show('Vault unlocked');
      else this.toast.show('No vault found for that passphrase', 'error');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      this.unlocking.set(false);
    }
  }

  protected async saveProfile(label: string): Promise<void> {
    const id = await this.vault.saveProfile(
      label.trim() || 'My profile',
      this.draft.answers(),
      this.draft.editingProfileId(),
    );
    this.draft.editingProfileId.set(id);
    this.toast.show('Saved to vault');
  }
}
