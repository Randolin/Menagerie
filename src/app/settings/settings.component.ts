import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GC_EMPTY_HUMAN, GC_IDLE_HUMAN } from '@moxy/core';
import { ToastService } from '@moxy/ui';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { MetricsStore } from '../stores/metrics.store';

/**
 * The things you set once and then forget: what leaves this device, what stays
 * on it, and how to end the profile. Nothing here is part of the profile
 * itself, which is why it no longer sits under the answers.
 */
@Component({
  selector: 'moxy-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="card">
      <h2 i18n>Contribute anonymously</h2>
      <p i18n class="sub">
        Once a month, opted-in profiles add coarse counts to a public,
        <a routerLink="/community">community-wide picture</a> — age band plus bucketed answers,
        never your name, creature, phrases, or anything the server could tie back to this profile.
        Desire counts are submitted with random noise, so even the server can’t know any single
        answer was real. Buckets with fewer than ten contributors are never shown.
      </p>
      <label class="fine" style="display:flex;gap:8px;align-items:center">
        <input
          type="checkbox"
          [checked]="session.metricsOptIn()"
          (change)="toggleMetrics($event)"
        />
        <span i18n>Count my answers in the anonymous community stats</span>
      </label>
    </div>

    <div class="card">
      <h2 i18n>Keys &amp; housekeeping</h2>
      <p i18n class="sub">
        Housekeeping: profiles with no saved answers are deleted after {{ gcEmpty }}; profiles
        untouched and unviewed for {{ gcIdle }} are deleted too. Saving anything, or anyone viewing
        you, keeps yours alive. There is no account and no reset, so the
        <a routerLink="/backup">backup card</a> is worth printing while you still can.
      </p>
      <label class="fine" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input type="checkbox" [checked]="session.remembered()" (change)="toggleRemember($event)" />
        <span i18n
          >Remember my edit phrase on this device — stored unencrypted in this browser</span
        >
      </label>
      <label class="fine" style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
        <input type="checkbox" [checked]="session.keepDraft()" (change)="toggleKeepDraft($event)" />
        <span i18n
          >Keep unsaved answers on this device — encrypted under your edit phrase, so they come back
          when you next log in here</span
        >
      </label>
      @if (session.keepDraft() && session.remembered()) {
        <p i18n class="fine" style="margin-top:-6px">
          Both boxes are ticked, so this browser holds your edit phrase <em>and</em> the answers it
          unlocks. Anyone with this device has both halves — fine on a phone only you use, worth
          reconsidering on a shared one.
        </p>
      }
      @if (newEditPhrase(); as phrase) {
        <div class="notice">
          <span i18n
            >Your <strong>new edit phrase</strong> — the old one is dead. Save this one now:</span
          >
          <div class="passphrase-box" style="margin-top:8px">{{ phrase }}</div>
        </div>
      }
      <div class="btn-row">
        <a i18n class="btn btn-primary" routerLink="/backup">🖨️ Backup card</a>
        <button i18n class="btn" (click)="changeEditPhrase()">Change edit phrase</button>
        <button i18n class="btn btn-ghost" (click)="logout()">Log out on this device</button>
        <button i18n class="btn btn-danger" (click)="deleteProfile()">
          Delete profile forever
        </button>
      </div>
    </div>
  `,
})
export class SettingsComponent {
  protected readonly session = inject(ProfileSessionStore);
  private readonly metrics = inject(MetricsStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly gcEmpty = GC_EMPTY_HUMAN;
  protected readonly gcIdle = GC_IDLE_HUMAN;
  protected readonly newEditPhrase = signal<string | null>(null);

  protected async changeEditPhrase(): Promise<void> {
    const sure = confirm(
      $localize`Mint a new edit phrase? The current one stops working immediately.`,
    );
    if (!sure) return;
    try {
      this.newEditPhrase.set(await this.session.changeEditPhrase());
      this.toast.show($localize`Edit phrase changed — save the new one now`);
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected async toggleKeepDraft(event: Event): Promise<void> {
    const on = (event.target as HTMLInputElement).checked;
    await this.session.setKeepDraft(on);
    this.toast.show(
      on
        ? $localize`Unsaved answers will be kept on this device, encrypted`
        : $localize`Unsaved answers are no longer kept — the stored copy is gone`,
    );
  }

  protected toggleRemember(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.session.setRemember(on);
    this.toast.show(
      on ? $localize`Edit phrase stored in this browser` : $localize`Edit phrase forgotten`,
    );
  }

  protected async toggleMetrics(event: Event): Promise<void> {
    const on = (event.target as HTMLInputElement).checked;
    try {
      await this.metrics.setMetricsOptIn(on);
      this.toast.show(
        on
          ? $localize`Counted — thank you. You can opt out any time.`
          : $localize`Opted out — no further submissions.`,
      );
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected logout(): void {
    this.session.logout();
    void this.router.navigate(['/']);
  }

  protected async deleteProfile(): Promise<void> {
    const sure = confirm(
      $localize`Delete this profile from the server forever? Nobody — including us — can bring it back.`,
    );
    if (!sure) return;
    try {
      await this.session.deleteProfile();
      this.toast.show($localize`Profile deleted`);
      void this.router.navigate(['/']);
    } catch (err) {
      this.toast.error(err);
    }
  }
}
