import { inject, Injectable, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Suffix on every page but the landing one, which is the brand already. */
const BRAND = 'Menagerie';

/**
 * One place where a navigation becomes a name, used twice.
 *
 * A sighted user gets it in the tab and in bookmarks — before this every page
 * was "Menagerie — anonymous compatibility profiles", so browser history was
 * unreadable. A screen-reader user gets it announced: this is a hash-routed
 * SPA, so the browser never announces a page change on its own, and the shell
 * moves focus to #view without saying where it landed. The live region says.
 */
@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  /** Read by the shell's aria-live region; empty until the first navigation. */
  readonly announcement = signal('');

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(
      page ? `${page} — ${BRAND}` : `${BRAND} — anonymous compatibility profiles`,
    );
    // Navigating from a route to itself leaves this text unchanged, and an
    // aria-live region only speaks when its text changes. That silence is
    // correct: nothing moved.
    this.announcement.set(page ? `${page} page` : `${BRAND} home page`);
  }
}
