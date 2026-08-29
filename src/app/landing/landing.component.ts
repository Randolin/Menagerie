import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  describePhrase,
  diagnoseEditPhrase,
  diagnoseViewPhrase,
  extractViewPhrase,
} from '@moxy/core';
import { ToastService } from '@moxy/ui';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { ServerConfigStore } from '../stores/server-config.store';

/** The whole front door: exactly three actions. */
@Component({
  selector: 'moxy-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="card" style="text-align:center">
      <h1 i18n style="margin-bottom:6px">Compatibility, minus the identity</h1>
      <p i18n class="sub" style="max-width:52ch;margin:0 auto">
        Hatch an anonymous profile, answer what you like, share a phrase or QR code. Comparing
        reveals overlap — and intimate interests only when they’re mutual. No accounts, no email, no
        names required. <a routerLink="/about">How it works</a>
      </p>
      <!-- The payoff is a comparison, and a comparison needs two finished
           profiles — so the only way to show it up front is a fictional pair.
           This works with no session and no server. -->
      <a i18n class="btn btn-primary" routerLink="/demo" style="margin-top:14px"
        >🔍 See a comparison first</a
      >
    </div>

    @if (config.state() === 'unconfigured') {
      <div class="card">
        <div class="notice">
          <span i18n
            ><strong>No profile server is configured.</strong> This copy of Menagerie doesn’t know
            where profiles live, so hatching and viewing are disabled. If you run your own server,
            set its URL:</span
          >
        </div>
        <form
          style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"
          (submit)="saveServer($event, serverInput)"
        >
          <input
            #serverInput
            type="text"
            i18n-placeholder
            placeholder="https://profiles.example.com"
            i18n-aria-label
            aria-label="Profile server URL"
            style="flex:1;min-width:240px"
          />
          <button i18n class="btn">Use this server</button>
        </form>
      </div>
    }

    <div class="landing-actions">
      <div class="card">
        <h2 i18n>🥚 Hatch</h2>
        <p i18n class="sub">
          Start fresh. Your profile — creature name, QR code, and edit phrase — exists instantly,
          before you answer anything.
        </p>
        <button
          class="btn btn-primary"
          [disabled]="hatching() || config.state() !== 'ready'"
          (click)="hatch()"
        >
          @if (hatching()) {
            <span i18n>Hatching…</span>
          } @else {
            <span i18n>Hatch a profile</span>
          }
        </button>
      </div>

      <div class="card">
        <h2 i18n>✏️ Edit</h2>
        <p i18n class="sub">Come back to your own profile with your 5-word edit phrase.</p>
        <form style="display:flex;flex-direction:column;gap:8px" (submit)="edit($event, editInput)">
          <input
            #editInput
            type="text"
            i18n-placeholder
            placeholder="correct horse battery staple luck"
            autocomplete="off"
            i18n-aria-label
            aria-label="Edit phrase"
            (input)="editProblem.set(null)"
          />
          @if (editProblem(); as message) {
            <p class="notice-warn notice" style="margin:0">{{ message }}</p>
          }
          <button i18n class="btn" [disabled]="config.state() !== 'ready'">Open my profile</button>
        </form>
      </div>

      <div class="card">
        <h2 i18n>👀 View</h2>
        <p i18n class="sub">See someone’s profile from the phrase or link they shared.</p>
        <form style="display:flex;flex-direction:column;gap:8px" (submit)="view($event, viewInput)">
          <input
            #viewInput
            type="text"
            i18n-placeholder
            placeholder="amber-azure-fox-mistwoven-emberlit-fernhollow"
            autocomplete="off"
            i18n-aria-label
            aria-label="View phrase"
            (input)="viewProblem.set(null)"
          />
          @if (viewProblem(); as message) {
            <p class="notice-warn notice" style="margin:0">{{ message }}</p>
          }
          <button i18n class="btn" [disabled]="config.state() !== 'ready'">View profile</button>
        </form>
      </div>
    </div>
  `,
  styles: `
    .landing-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    .landing-actions .card {
      margin: 0;
      display: flex;
      flex-direction: column;
    }
    .landing-actions .sub {
      flex: 1;
    }
  `,
})
export class LandingComponent {
  protected readonly config = inject(ServerConfigStore);
  private readonly session = inject(ProfileSessionStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly hatching = signal(false);
  /** Inline and per-field: a correction belongs beside the box it fixes. */
  protected readonly editProblem = signal<string | null>(null);
  protected readonly viewProblem = signal<string | null>(null);

  protected async hatch(): Promise<void> {
    this.hatching.set(true);
    try {
      await this.session.hatch();
      await this.router.navigate(['/me']);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.hatching.set(false);
    }
  }

  protected async edit(event: Event, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const message = describePhrase(await diagnoseEditPhrase(input.value), 'edit phrase');
    if (message) {
      this.editProblem.set(message);
      return;
    }
    this.editProblem.set(null);
    try {
      if (await this.session.login(input.value)) {
        await this.router.navigate(['/me']);
      } else {
        this.toast.show($localize`No profile answers to that phrase.`, 'error');
      }
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected view(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const phrase = extractViewPhrase(input.value);
    if (!phrase) {
      // The grammar check already knows which word is wrong; "that doesn't
      // look like a phrase" made the person hunt for it themselves.
      this.viewProblem.set(
        describePhrase(diagnoseViewPhrase(input.value), 'view phrase') ??
          'That doesn’t look like a Menagerie view phrase or link.',
      );
      return;
    }
    this.viewProblem.set(null);
    void this.router.navigate(['/view', phrase]);
  }

  protected saveServer(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    if (!input.value.trim()) return;
    this.config.setOverride(input.value);
    this.toast.show($localize`Server saved for this browser.`);
  }
}
