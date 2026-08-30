import { bootstrapApplication } from '@angular/platform-browser';
import { warmPhraseKdf } from '@mng/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { installLocale } from './app/i18n/locale';

// Translations have to be in place before the first template renders, and
// installLocale resolves to English rather than rejecting, so this can never
// be the step that stops the app from starting.
void installLocale()
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));

// Registered after bootstrap so a failing or unsupported service worker can
// never keep the app from starting. It caches this origin's own static files
// and nothing else — see public/sw.js for what that deliberately excludes.
if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    void navigator.serviceWorker.register('sw.js').catch(() => undefined);
  });
}

// Argon2 is fetched on demand rather than in the initial bundle, which keeps
// ~28 kB off the first paint. Warm it once the page is idle so the service
// worker has it cached before anyone unlocks a profile — including offline,
// where an unfetched chunk would be a lockout. See warmPhraseKdf.
if ('requestIdleCallback' in globalThis) {
  requestIdleCallback(() => warmPhraseKdf(), { timeout: 4000 });
} else {
  addEventListener('load', () => warmPhraseKdf());
}
