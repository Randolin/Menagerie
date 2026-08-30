import { computed, inject, Injectable, signal } from '@angular/core';
import { HatchClient } from '@mng/core';
import { APP_STORAGE } from './storage.token';

/**
 * Where profiles live. Resolution order:
 *   1. localStorage override `menagerie.server.v2` (power users, e2e harness)
 *   2. `menagerie.config.json` next to index.html (stamped by the deploy workflow)
 *   3. nothing → 'unconfigured': the app says so instead of failing weirdly.
 *
 * App-level and unencrypted on purpose: the address must be known BEFORE any
 * credential exists, and it reveals only which server this browser talks to.
 */
const OVERRIDE_KEY = 'menagerie.server.v2';

export type ServerConfigState = 'loading' | 'ready' | 'unconfigured';

@Injectable({ providedIn: 'root' })
export class ServerConfigStore {
  private readonly storage = inject(APP_STORAGE);

  readonly serverUrl = signal('');
  readonly state = signal<ServerConfigState>('loading');
  readonly client = computed<HatchClient | null>(() => {
    const url = this.serverUrl();
    return url ? new HatchClient(url) : null;
  });

  /** Runs as an app initializer — routing waits for the resolution. */
  async init(): Promise<void> {
    const override = this.read(OVERRIDE_KEY);
    if (override) {
      this.serverUrl.set(override);
      this.state.set('ready');
      return;
    }
    try {
      // Relative to the deployed app, wherever it's hosted.
      const res = await fetch('menagerie.config.json', { cache: 'no-cache' });
      if (res.ok) {
        const config = (await res.json()) as { serverUrl?: unknown };
        if (typeof config.serverUrl === 'string' && config.serverUrl.trim()) {
          this.serverUrl.set(config.serverUrl.trim().replace(/\/+$/, ''));
          this.state.set('ready');
          return;
        }
      }
    } catch {
      /* fall through to unconfigured */
    }
    this.state.set('unconfigured');
  }

  setOverride(url: string): void {
    const clean = url.trim().replace(/\/+$/, '');
    try {
      if (clean) this.storage.setItem(OVERRIDE_KEY, clean);
      else this.storage.removeItem(OVERRIDE_KEY);
    } catch {
      /* storage unavailable */
    }
    this.serverUrl.set(clean);
    this.state.set(clean ? 'ready' : 'unconfigured');
  }

  private read(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }
}
