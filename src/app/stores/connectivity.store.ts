import { Injectable, signal } from '@angular/core';

/**
 * Is there a network right now?
 *
 * `navigator.onLine` is famously optimistic — it reports the link, not the
 * internet — so nothing here is allowed to *decide* anything on its own. It
 * exists to answer two narrow questions honestly: what to tell someone whose
 * save just failed with `kind: 'network'`, and when it is worth retrying that
 * save without being asked. A false "online" costs one retry that fails the
 * same way; a false "offline" costs nothing, because the Save button never
 * consults this.
 *
 * Deliberately not a poll. This app promises it makes no request while you
 * are away (see the About page), and a reachability probe on a timer would be
 * exactly the heartbeat that promise rules out.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityStore {
  readonly online = signal(readOnline());

  /** Runs `fn` the next time the browser says the network came back. */
  onReconnect(fn: () => void): void {
    this.reconnectHandlers.push(fn);
  }

  private readonly reconnectHandlers: (() => void)[] = [];

  constructor() {
    globalThis.addEventListener?.('online', () => {
      this.online.set(true);
      for (const fn of this.reconnectHandlers) fn();
    });
    globalThis.addEventListener?.('offline', () => this.online.set(false));
  }
}

function readOnline(): boolean {
  // Absent in non-browser test environments; assume a network rather than
  // reporting a phantom outage.
  return globalThis.navigator?.onLine ?? true;
}
