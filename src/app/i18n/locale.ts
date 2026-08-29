import { loadTranslations } from '@angular/localize';
import { loadMessages, type MessageBag } from '@moxy/core';

/**
 * Pick a language and install it, before anything renders.
 *
 * Two catalogues, because there are two mechanisms and no way around it: the
 * app's templates compile to `$localize` calls that Angular's own extractor
 * produces ids for, while the survey schema lives in `libs/core`, which may
 * not import a framework and is keyed by its own frozen item ids instead.
 * They ship in one file so a translator has one thing to fill in, and so a
 * half-loaded page — chrome in one language, questions in another — is not a
 * state this can reach.
 *
 * Runtime loading rather than a build per locale: this is a static bundle on
 * GitHub Pages with hash routing, so per-locale builds would mean per-locale
 * directories and a redirect, and the whole point of the deploy is that it is
 * one folder of files. The cost is one fetch before bootstrap, paid only when
 * a locale other than the source is actually wanted.
 */
const STORED = 'menagerie.locale.v1';

/** The language the copy is written in — no fetch, no catalogue, no cost. */
export const SOURCE_LOCALE = 'en';

interface Catalogue {
  /** Angular message id → translated template string. */
  readonly template?: Record<string, string>;
  /** Schema message key → translated string (see libs/core/src/i18n). */
  readonly domain?: MessageBag;
}

/**
 * An explicit `?lang=` wins, then a remembered choice, then the browser's own
 * preference. Region subtags are dropped: this app has one Portuguese, not
 * two, and matching `pt-BR` against a `pt` catalogue is the behaviour anyone
 * would expect.
 */
export function preferredLocale(): string {
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked) return normalize(asked);
  try {
    const stored = localStorage.getItem(STORED);
    if (stored) return normalize(stored);
  } catch {
    /* private mode — fall through to the browser's preference */
  }
  return normalize(globalThis.navigator?.language ?? SOURCE_LOCALE);
}

function normalize(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] || SOURCE_LOCALE;
}

/**
 * Install `locale`, or leave the source English in place.
 *
 * Every failure is the same outcome — English — because a missing or broken
 * catalogue must never be the reason someone cannot open their profile. The
 * app is fully usable in the language it was written in; a translation is an
 * improvement on that, never a dependency of it.
 */
export async function installLocale(locale = preferredLocale()): Promise<string> {
  if (locale === SOURCE_LOCALE) return SOURCE_LOCALE;
  try {
    const res = await fetch(`i18n/${locale}.json`, { cache: 'no-cache' });
    if (!res.ok) return SOURCE_LOCALE;
    const catalogue = (await res.json()) as Catalogue;
    if (catalogue.template) loadTranslations(catalogue.template);
    if (catalogue.domain) loadMessages(catalogue.domain);
    return locale;
  } catch {
    return SOURCE_LOCALE;
  }
}

/** Remember a choice for next time. Takes effect on the next load. */
export function rememberLocale(locale: string): void {
  try {
    if (normalize(locale) === SOURCE_LOCALE) localStorage.removeItem(STORED);
    else localStorage.setItem(STORED, normalize(locale));
  } catch {
    /* the ?lang= query is still available as the explicit route */
  }
}
