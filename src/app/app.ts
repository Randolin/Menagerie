import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CreatureIconComponent, ToastComponent, ToastService } from '@moxy/ui';
import { ThemeStore } from './stores/theme.store';
import { ProfileSessionStore } from './stores/profile-session.store';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CreatureIconComponent, ToastComponent],
  templateUrl: './app.html',
})
export class App {
  private readonly theme = inject(ThemeStore);
  private readonly toast = inject(ToastService);
  protected readonly session = inject(ProfileSessionStore);
  private readonly router = inject(Router);

  /** Waiting boops, for the nav badge. */
  protected readonly boopCount = computed(() => this.session.incomingBoops().length);

  constructor() {
    // Header paw tint follows the logged-in creature (nothing persisted;
    // clears itself on logout/regenerate because the signal drives it).
    effect(() => {
      const persona = this.session.persona();
      const style = document.documentElement.style;
      if (persona) {
        style.setProperty('--session-persona', persona.color);
        style.setProperty('--session-persona-ink', '#ffffff');
      } else {
        style.removeProperty('--session-persona');
        style.removeProperty('--session-persona-ink');
      }
    });

    // Boops are pull-only, and they used to be fetched by the dashboard's
    // constructor — so they were only ever discovered by visiting /me. Now
    // that they live on their own page, the shell polls once when a session
    // becomes active, which is what lets the nav badge show a waiting boop
    // from anywhere. This fires once and cannot see boops that arrive later,
    // so MenagerieComponent re-polls on every visit; the two together give a
    // badge everywhere AND fresh data on the page that shows them.
    // Metrics ride along: a monthly background submission, never page-bound.
    let polled = false;
    effect(() => {
      if (!this.session.active() || polled) return;
      polled = true;
      this.session.maybeSubmitMetrics();
      void this.session.pollBoops().catch(() => undefined);
      void this.session.pollSentBoops().catch(() => undefined);
    });
  }

  protected logout(): void {
    this.session.logout();
    void this.router.navigate(['/']);
  }

  protected cycleTheme(): void {
    const next = this.theme.cycle();
    this.toast.show(next ? `Theme: ${next}` : 'Theme: follow system');
  }
}
