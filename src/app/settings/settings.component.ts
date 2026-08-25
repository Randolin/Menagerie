import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GC_EMPTY_HUMAN, GC_IDLE_HUMAN } from '@moxy/core';
import { ToastService } from '@moxy/ui';
import { ProfileSessionStore } from '../stores/profile-session.store';

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
      <h2>Contribute anonymously</h2>
      <p class="sub">
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
        Count my answers in the anonymous community stats
      </label>
    </div>

    <div class="card">
      <h2>Keys &amp; housekeeping</h2>
      <p class="sub">
        Housekeeping: profiles with no saved answers are deleted after {{ gcEmpty }}; profiles
        untouched and unviewed for {{ gcIdle }} are deleted too. Saving anything, or anyone viewing
        you, keeps yours alive.
      </p>
      <label class="fine" style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
        <input type="checkbox" [checked]="session.remembered()" (change)="toggleRemember($event)" />
        Remember my edit phrase on this device — stored unencrypted in this browser
      </label>
      @if (newEditPhrase(); as phrase) {
        <div class="notice">
          Your <strong>new edit phrase</strong> — the old one is dead. Save this one now:
          <div class="passphrase-box" style="margin-top:8px">{{ phrase }}</div>
        </div>
      }
      <div class="btn-row">
        <button class="btn" (click)="changeEditPhrase()">Change edit phrase</button>
        <button class="btn btn-ghost" (click)="logout()">Log out on this device</button>
        <button class="btn btn-danger" (click)="deleteProfile()">Delete profile forever</button>
      </div>
    </div>
  `,
})
export class SettingsComponent {
  protected readonly session = inject(ProfileSessionStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly gcEmpty = GC_EMPTY_HUMAN;
  protected readonly gcIdle = GC_IDLE_HUMAN;
  protected readonly newEditPhrase = signal<string | null>(null);

  protected async changeEditPhrase(): Promise<void> {
    const sure = confirm('Mint a new edit phrase? The current one stops working immediately.');
    if (!sure) return;
    try {
      this.newEditPhrase.set(await this.session.changeEditPhrase());
      this.toast.show('Edit phrase changed — save the new one now');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected toggleRemember(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.session.setRemember(on);
    this.toast.show(on ? 'Edit phrase stored in this browser' : 'Edit phrase forgotten');
  }

  protected async toggleMetrics(event: Event): Promise<void> {
    const on = (event.target as HTMLInputElement).checked;
    try {
      await this.session.setMetricsOptIn(on);
      this.toast.show(
        on
          ? 'Counted — thank you. You can opt out any time.'
          : 'Opted out — no further submissions.',
      );
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected logout(): void {
    this.session.logout();
    void this.router.navigate(['/']);
  }

  protected async deleteProfile(): Promise<void> {
    const sure = confirm(
      'Delete this profile from the server forever? Nobody — including us — can bring it back.',
    );
    if (!sure) return;
    try {
      await this.session.deleteProfile();
      this.toast.show('Profile deleted');
      void this.router.navigate(['/']);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }
}
