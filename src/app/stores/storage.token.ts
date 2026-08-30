import { InjectionToken } from '@angular/core';
import type { StorageLike } from '@mng/core';

/** The app injects real localStorage; tests can provide a MemoryStorage. */
export const APP_STORAGE = new InjectionToken<StorageLike>('menagerie.storage', {
  providedIn: 'root',
  factory: () => localStorage,
});
