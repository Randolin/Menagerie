import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CreatureAvatarComponent, QrCodeComponent } from '@moxy/ui';
import { ProfileSessionStore } from '../stores/profile-session.store';

/**
 * One page you can put in a drawer.
 *
 * Losing the edit phrase is this product's only unrecoverable failure, and
 * the sole mitigation so far has been telling people to write it down. This
 * gives them something worth writing down: both phrases, the creature, the
 * QR, and one line each on what they do — printable to paper, or to PDF for
 * a password manager, using nothing but the browser's own print dialog.
 *
 * It carries the edit phrase in plain text, so it says so, loudly, and the
 * route is behind the session guard: a view-only visitor can never reach it.
 */
@Component({
  selector: 'moxy-backup-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CreatureAvatarComponent, QrCodeComponent],
  template: `
    <div class="card no-print">
      <h1 i18n style="margin-top:0">Backup card</h1>
      <p i18n class="sub">
        Print this and put it somewhere you'd keep a passport, or save it as a PDF into a password
        manager. It is the difference between losing a phone and losing a profile.
      </p>
      <div class="notice-warn notice">
        <span i18n
          ><strong>This card carries your edit phrase.</strong> Anyone holding it can edit or delete
          this profile — printing it puts full control on a piece of paper. Don't leave it on a
          shared printer, and don't photograph it onto a camera roll that syncs somewhere you
          wouldn't put a password.</span
        >
      </div>
      <div class="btn-row" style="margin-top:14px">
        <button i18n class="btn btn-primary" (click)="print()">🖨️ Print or save as PDF</button>
        <a i18n class="btn btn-ghost" routerLink="/settings">Back to settings</a>
      </div>
    </div>

    @if (viewPhrase(); as view) {
      <div class="card backup-card">
        <div class="backup-head">
          @if (session.persona(); as persona) {
            <moxy-creature-avatar [persona]="persona" [size]="64" />
            <div>
              <h2 style="margin:0">{{ persona.name }}</h2>
              <p i18n class="fine" style="margin:2px 0 0">Menagerie profile · saved {{ today }}</p>
            </div>
          }
        </div>

        <h3 i18n style="margin-bottom:4px">View phrase — share this</h3>
        <p i18n class="fine" style="margin-top:0">
          Read-only. Anyone with it can see your saved answers and compare against them. It can
          never edit anything.
        </p>
        <div class="code-box">{{ view }}</div>
        @if (session.viewUrl(); as url) {
          <div class="backup-qr">
            <moxy-qr-code [text]="url" [persona]="session.persona()" />
          </div>
        }

        <h3 i18n style="margin-bottom:4px">Edit phrase — keep this secret</h3>
        <p i18n class="fine" style="margin-top:0">
          The only way to change or delete this profile. There is no account and no reset: lose it
          and this profile can never be edited again, by you or by anyone.
        </p>
        <div class="passphrase-box">{{ session.editPhrase() }}</div>

        <p i18n class="fine backup-foot">
          Menagerie stores only ciphertext it can't read. These two phrases are the entire identity
          of this profile — there is nothing else to recover it with.
        </p>
      </div>
    } @else {
      <div class="card"><p i18n class="sub">No session — log in to print a card.</p></div>
    }
  `,
  styles: `
    .backup-head {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 16px;
    }
    .backup-qr {
      margin: 10px 0 18px;
    }
    .backup-foot {
      margin-top: 18px;
      padding-top: 10px;
      border-top: 1px solid var(--hairline);
    }
  `,
})
export class BackupCardComponent {
  protected readonly session = inject(ProfileSessionStore);

  protected readonly viewPhrase = computed(() => this.session.viewPhrase());

  /** Written on the card so a drawer full of them can be told apart. */
  protected readonly today = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  protected print(): void {
    window.print();
  }
}
