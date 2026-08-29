import { effect, inject, Injectable, signal } from '@angular/core';
import { APP_STORAGE } from './storage.token';

const THEME_KEY = 'menagerie.theme'; // unchanged from the legacy app

export type ThemeChoice = 'light' | 'dark' | null; // null = follow system

@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly storage = inject(APP_STORAGE);
  readonly theme = signal<ThemeChoice>(this.loadStored());

  constructor() {
    effect(() => {
      const t = this.theme();
      if (t) document.documentElement.dataset['theme'] = t;
      else delete document.documentElement.dataset['theme'];
      try {
        if (t) this.storage.setItem(THEME_KEY, t);
        else this.storage.removeItem(THEME_KEY);
      } catch {
        /* ignore */
      }
    });
  }

  /** dark → light → follow-system → dark … */
  cycle(): ThemeChoice {
    const next: ThemeChoice =
      this.theme() === 'dark' ? 'light' : this.theme() === 'light' ? null : 'dark';
    this.theme.set(next);
    return next;
  }

  private loadStored(): ThemeChoice {
    try {
      const t = this.storage.getItem(THEME_KEY);
      return t === 'light' || t === 'dark' ? t : null;
    } catch {
      return null;
    }
  }
}
