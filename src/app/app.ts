import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastComponent, ToastService } from '@moxy/ui';
import { ThemeStore } from './stores/theme.store';
import { ProfileSessionStore } from './stores/profile-session.store';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastComponent],
  templateUrl: './app.html',
})
export class App {
  private readonly theme = inject(ThemeStore);
  private readonly toast = inject(ToastService);
  private readonly session = inject(ProfileSessionStore);

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
  }

  protected cycleTheme(): void {
    const next = this.theme.cycle();
    this.toast.show(next ? `Theme: ${next}` : 'Theme: follow system');
  }
}
