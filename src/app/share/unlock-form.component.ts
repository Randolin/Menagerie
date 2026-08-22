import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/** Passphrase entry; emits the entered passphrase, parent does the unlocking. */
@Component({
  selector: 'moxy-unlock-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="field" (submit)="submit($event, input.value)">
      <input #input type="text" autocomplete="off" autocapitalize="none" spellcheck="false"
             placeholder="five words like these ones here" aria-label="Vault passphrase">
      <div class="btn-row" style="margin-top:10px">
        <button class="btn btn-primary" [disabled]="busy()">
          {{ busy() ? 'Deriving key…' : 'Unlock' }}
        </button>
      </div>
    </form>
  `,
})
export class UnlockFormComponent {
  readonly busy = input<boolean>(false);
  readonly passphrase = output<string>();
  protected readonly working = signal(false);

  protected submit(event: Event, value: string): void {
    event.preventDefault();
    if (!value.trim() || this.busy()) return;
    this.passphrase.emit(value);
  }
}
