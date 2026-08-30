import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { describePhrase, diagnoseEditPhrase, extractEditPhrase } from '@moxy/core';
import { ToastService } from '@moxy/ui';
import { ProfileSessionStore } from '../stores/profile-session.store';

/** Where guarded routes land without a session. */
@Component({
  selector: 'moxy-edit-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="card" style="max-width:540px;margin-inline:auto">
      <h2 i18n>Open your profile</h2>
      <p i18n class="sub">
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
          i18n-placeholder
          placeholder="correct horse battery staple luck"
          autocomplete="off"
          i18n-aria-label
          aria-label="Edit phrase"
          [disabled]="busy()"
          (input)="problem.set(null)"
        />
        @if (problem(); as message) {
          <p class="notice-warn notice" style="margin:0">{{ message }}</p>
        }
        <label class="fine" style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" #rememberBox />
          <span i18n>Remember on this device — stores the phrase unencrypted in this browser</span>
        </label>
        <div class="btn-row">
          <button class="btn btn-primary" [disabled]="busy()">
            @if (busy()) {
              <span i18n>Opening…</span>
            } @else {
              <span i18n>Open my profile</span>
            }
          </button>
          <a i18n class="btn btn-ghost" routerLink="/">Back</a>
        </div>
      </form>
      <p i18n class="fine" style="margin-top:14px">
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
  /** Inline, not a toast: it is a correction to read while retyping. */
  protected readonly problem = signal<string | null>(null);

  protected async login(event: Event, phrase: string, remember: boolean): Promise<void> {
    event.preventDefault();
    // The copy button hands out the phrase under a warning line, so accept it
    // back with the warning still attached rather than failing on the paste
    // this app itself produced.
    const typed = (await extractEditPhrase(phrase)) ?? phrase;
    // A phrase with a word the EFF list doesn't have cannot open anything, and
    // saying so takes microseconds where the KDF below takes seconds.
    const message = describePhrase(await diagnoseEditPhrase(typed), 'edit phrase');
    if (message) {
      this.problem.set(message);
      return;
    }
    this.problem.set(null);
    this.busy.set(true);
    try {
      if (await this.session.login(typed)) {
        if (remember) this.session.setRemember(true);
        await this.router.navigate(['/me']);
      } else {
        this.toast.show($localize`No profile answers to that phrase.`, 'error');
      }
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
