import { inject, Injectable, signal } from '@angular/core';
import { APP_STORAGE } from './storage.token';

// App-level (unencrypted) on purpose: the log-in-from-a-new-device flow needs
// the server address BEFORE any vault blob exists locally. It reveals only
// which sync server this browser talks to — per-vault enrollment lives inside
// the encrypted vault data.
const SERVER_KEY = 'moxy.sync.server.v1';

@Injectable({ providedIn: 'root' })
export class SyncSettingsStore {
  private readonly storage = inject(APP_STORAGE);
  readonly serverUrl = signal<string>(this.load());

  setServerUrl(url: string): void {
    const clean = url.trim().replace(/\/+$/, '');
    this.serverUrl.set(clean);
    try {
      if (clean) this.storage.setItem(SERVER_KEY, clean);
      else this.storage.removeItem(SERVER_KEY);
    } catch {
      /* ignore */
    }
  }

  private load(): string {
    try {
      return this.storage.getItem(SERVER_KEY) ?? '';
    } catch {
      return '';
    }
  }
}
