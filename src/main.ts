import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

// Registered after bootstrap so a failing or unsupported service worker can
// never keep the app from starting. It caches this origin's own static files
// and nothing else — see public/sw.js for what that deliberately excludes.
if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    void navigator.serviceWorker.register('sw.js').catch(() => undefined);
  });
}
