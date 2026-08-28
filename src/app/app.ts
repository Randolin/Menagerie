import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CreatureAvatarComponent, ToastComponent, ToastService } from '@moxy/ui';
import { PageTitleStrategy } from './page-title.strategy';
import { ThemeStore } from './stores/theme.store';
import { ProfileSessionStore } from './stores/profile-session.store';
import { BoopStore } from './stores/boop.store';
import { MetricsStore } from './stores/metrics.store';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CreatureAvatarComponent, ToastComponent],
  templateUrl: './app.html',
})
export class App {
  private readonly theme = inject(ThemeStore);
  private readonly toast = inject(ToastService);
  protected readonly session = inject(ProfileSessionStore);
  private readonly boops = inject(BoopStore);
  private readonly metrics = inject(MetricsStore);
  private readonly router = inject(Router);
  private readonly pageTitle = inject(PageTitleStrategy);

  /** Waiting boops, for the nav badge. */
  protected readonly boopCount = computed(() => this.session.incomingBoops().length);

  /** What the live region says: the name of the page just navigated to. */
  protected readonly announcement = this.pageTitle.announcement;

  constructor() {
    // Focus follows navigation. Without this, activating a nav link leaves
    // focus on the link, so the next Tab continues through the header and a
    // screen reader never enters the page it just opened. The first
    // navigation is the page load itself — the browser's own focus is right
    // there, and moving it would be a jump the user did not ask for.
    let firstNavigation = true;
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        if (firstNavigation) {
          firstNavigation = false;
          return;
        }
        this.focusContent();
      });

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
      this.metrics.maybeSubmitMetrics();
      void this.boops.pollBoops().catch(() => undefined);
      void this.boops.pollSentBoops().catch(() => undefined);
    });
  }

  /** Skip-link target: jump the keyboard past the header into the page. */
  protected skipToContent(): void {
    this.focusContent();
  }

  private focusContent(): void {
    document.getElementById('view')?.focus();
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
