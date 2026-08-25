import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { extractViewPhrase } from '@moxy/core';
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
      <h1 style="margin-bottom:6px">Compatibility, minus the identity</h1>
      <p class="sub" style="max-width:52ch;margin:0 auto">
        Hatch an anonymous profile, answer what you like, share a phrase or QR code. Comparing
        reveals overlap — and intimate interests only when they’re mutual. No accounts, no email, no
        names required. <a routerLink="/about">How it works</a>
      </p>
    </div>

    @if (config.state() === 'unconfigured') {
      <div class="card">
        <div class="notice">
          <strong>No profile server is configured.</strong> This copy of Menagerie doesn’t know
          where profiles live, so hatching and viewing are disabled. If you run your own server, set
          its URL:
        </div>
        <form
          style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"
          (submit)="saveServer($event, serverInput)"
        >
          <input
            #serverInput
            type="text"
            placeholder="https://moxy-sync.example.com"
            aria-label="Profile server URL"
            style="flex:1;min-width:240px"
          />
          <button class="btn">Use this server</button>
        </form>
      </div>
    }

    <div class="landing-actions">
      <div class="card">
        <h2>🥚 Hatch</h2>
        <p class="sub">
          Start fresh. Your profile — creature name, QR code, and edit phrase — exists instantly,
          before you answer anything.
        </p>
        <button
          class="btn btn-primary"
          [disabled]="hatching() || config.state() !== 'ready'"
          (click)="hatch()"
        >
          {{ hatching() ? 'Hatching…' : 'Hatch a profile' }}
        </button>
      </div>

      <div class="card">
        <h2>✏️ Edit</h2>
        <p class="sub">Come back to your own profile with your 5-word edit phrase.</p>
        <form style="display:flex;flex-direction:column;gap:8px" (submit)="edit($event, editInput)">
          <input
            #editInput
            type="text"
            placeholder="correct horse battery staple luck"
            autocomplete="off"
            aria-label="Edit phrase"
          />
          <button class="btn" [disabled]="config.state() !== 'ready'">Open my profile</button>
        </form>
      </div>

      <div class="card">
        <h2>👀 View</h2>
        <p class="sub">See someone’s profile from the phrase or link they shared.</p>
        <form style="display:flex;flex-direction:column;gap:8px" (submit)="view($event, viewInput)">
          <input
            #viewInput
            type="text"
            placeholder="amber-azure-fox-canal-stove-plume"
            autocomplete="off"
            aria-label="View phrase"
          />
          <button class="btn" [disabled]="config.state() !== 'ready'">View profile</button>
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

  protected async hatch(): Promise<void> {
    this.hatching.set(true);
    try {
      await this.session.hatch();
      await this.router.navigate(['/me']);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      this.hatching.set(false);
    }
  }

  protected async edit(event: Event, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    try {
      if (await this.session.login(input.value)) {
        await this.router.navigate(['/me']);
      } else {
        this.toast.show('No profile answers to that phrase.', 'error');
      }
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected view(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const phrase = extractViewPhrase(input.value);
    if (!phrase) {
      this.toast.show('That doesn’t look like a Menagerie view phrase or link.', 'error');
      return;
    }
    void this.router.navigate(['/view', phrase]);
  }

  protected saveServer(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    if (!input.value.trim()) return;
    this.config.setOverride(input.value);
    this.toast.show('Server saved for this browser.');
  }
}
