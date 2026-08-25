import { Injectable, signal } from '@angular/core';
import { errorText } from '../util/errors';

export type ToastKind = 'info' | 'error';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  readonly message = signal<string | null>(null);
  readonly kind = signal<ToastKind>('info');

  show(message: string, kind: ToastKind = 'info'): void {
    this.message.set(message);
    this.kind.set(kind);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.message.set(null), 3200);
  }

  /** The catch-block idiom: surface any thrown value as an error toast. */
  error(err: unknown): void {
    this.show(errorText(err), 'error');
  }
}
