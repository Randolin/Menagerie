import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ToastService } from '@moxy/ui';
import { ProfileSessionStore } from '../stores/profile-session.store';

/** Where guarded routes land without a session. */
@Component({
  selector: 'moxy-edit-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="card" style="max-width:540px;margin-inline:auto">
      <h2>Open your profile</h2>
      <p class="sub">
        Enter the 5-word edit phrase you were given when you hatched. It’s the only key — there is
        no account and no reset.
      </p>
      <form
        style="display:flex;flex-direction:column;gap:10px"
        (submit)="login($event, phraseInput.value, rememberBox.checked)"
      >
        <input
          #phraseInput
          type="text"
          placeholder="correct horse battery staple luck"
          autocomplete="off"
          aria-label="Edit phrase"
          [disabled]="busy()"
        />
        <label class="fine" style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" #rememberBox />
          Remember on this device — stores the phrase unencrypted in this browser
        </label>
        <div class="btn-row">
          <button class="btn btn-primary" [disabled]="busy()">
            {{ busy() ? 'Opening…' : 'Open my profile' }}
          </button>
          <a class="btn btn-ghost" routerLink="/">Back</a>
        </div>
      </form>
      <p class="fine" style="margin-top:14px">
        Don’t have a profile yet? <a routerLink="/">Hatch one</a> — it takes one click.
      </p>
    </div>
  `,
})
export class EditLoginComponent {
  private readonly session = inject(ProfileSessionStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly busy = signal(false);

  protected async login(event: Event, phrase: string, remember: boolean): Promise<void> {
    event.preventDefault();
    this.busy.set(true);
    try {
      if (await this.session.login(phrase)) {
        if (remember) this.session.setRemember(true);
        await this.router.navigate(['/me']);
      } else {
        this.toast.show('No profile answers to that phrase.', 'error');
      }
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      this.busy.set(false);
    }
  }
}
