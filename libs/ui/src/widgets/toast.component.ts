import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

/** Render once in the app shell; shows whatever ToastService was last asked to say. */
@Component({
  selector: 'mng-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      id="toast"
      role="status"
      aria-live="polite"
      [class.show]="toast.message() !== null"
      [attr.data-kind]="toast.kind()"
    >
      {{ toast.message() }}
    </div>
  `,
})
export class ToastComponent {
  protected readonly toast = inject(ToastService);
}
