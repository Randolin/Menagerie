import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastComponent, ToastService } from '@moxy/ui';
import { ThemeStore } from './stores/theme.store';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastComponent],
  templateUrl: './app.html',
})
export class App {
  private readonly theme = inject(ThemeStore);
  private readonly toast = inject(ToastService);

  protected cycleTheme(): void {
    const next = this.theme.cycle();
    this.toast.show(next ? `Theme: ${next}` : 'Theme: follow system');
  }
}
