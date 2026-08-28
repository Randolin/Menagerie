import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, TitleStrategy, withHashLocation } from '@angular/router';
import { getSection } from '@moxy/core';
import { routes } from './app.routes';
import { provideComparePanel } from './compare/compare-panels.token';
import { PageTitleStrategy } from './page-title.strategy';
import { ServerConfigStore } from './stores/server-config.store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Hash location keeps the site deployable on any static host with no
    // rewrite rules — #/view/<phrase> works from a QR scan anywhere.
    provideRouter(routes, withHashLocation()),

    // Names every route once: browser tab, history, and the shell's live
    // region all read the same string.
    { provide: TitleStrategy, useExisting: PageTitleStrategy },

    // Resolve the profile server address before anything routes.
    provideAppInitializer(() => inject(ServerConfigStore).init()),

    // The compare view's datavis panels. Adding a new chart format is one
    // standalone component + one provideComparePanel() line here.
    provideComparePanel({
      id: 'headline',
      order: 10,
      loadComponent: () => import('./compare/panels/headline.panel').then((m) => m.HeadlinePanel),
    }),
    // Right after the headline: the sentences come before the shapes, because
    // they are what a screen reader gets, and what anyone reading under
    // stress reads first.
    provideComparePanel({
      id: 'narrative',
      order: 12,
      loadComponent: () => import('./compare/panels/narrative.panel').then((m) => m.NarrativePanel),
      // Pair comparisons only — with three or more profiles the honest
      // sentence is a paragraph of caveats, and the pairwise matrix says it
      // better.
      visible: (model) => model.payloads.length === 2 && model.pair !== null,
    }),
    provideComparePanel({
      id: 'fingerprint',
      order: 15,
      loadComponent: () =>
        import('./compare/panels/fingerprint.panel').then((m) => m.FingerprintPanel),
      // Needs at least three values scales everyone answered to draw shapes.
      visible: (model) => {
        const values = getSection('values');
        if (!values || model.payloads.length < 2) return false;
        return (
          values.items.filter(
            (item) =>
              item.type === 'scale' &&
              model.payloads.every((p) => typeof p.a[item.id] === 'number'),
          ).length >= 3
        );
      },
    }),
    provideComparePanel({
      id: 'interlock',
      order: 18,
      loadComponent: () => import('./compare/panels/interlock.panel').then((m) => m.InterlockPanel),
      visible: (model) => model.interlocks.some((row) => row.detailA || row.detailB),
    }),
    provideComparePanel({
      id: 'values-strips',
      order: 20,
      loadComponent: () =>
        import('./compare/panels/values-strips.panel').then((m) => m.ValuesStripsPanel),
      visible: (model) => {
        const grid = model.grid.find((g) => g.section.id === 'values');
        return Boolean(grid && grid.rows.some((r) => r.answeredCount > 0));
      },
    }),
    provideComparePanel({
      id: 'seeking-matrix',
      order: 30,
      loadComponent: () =>
        import('./compare/panels/seeking-matrix.panel').then((m) => m.SeekingMatrixPanel),
      visible: (model) => {
        const grid = model.grid.find((g) => g.section.id === 'seeking');
        return Boolean(grid && grid.rows.some((r) => r.answeredCount > 0));
      },
    }),
    provideComparePanel({
      id: 'desires',
      order: 40,
      loadComponent: () => import('./compare/panels/desires.panel').then((m) => m.DesiresPanel),
      visible: (model) => model.withTokensCount >= 1,
    }),
    provideComparePanel({
      id: 'agreement',
      order: 45,
      loadComponent: () => import('./compare/panels/agreement.panel').then((m) => m.AgreementPanel),
      visible: (model) =>
        model.payloads.length === 2 &&
        model.grid.some((g) => g.rows.some((r) => r.sim !== null && r.answeredCount === 2)),
    }),
    provideComparePanel({
      id: 'answer-grid',
      order: 50,
      loadComponent: () =>
        import('./compare/panels/answer-grid.panel').then((m) => m.AnswerGridPanel),
    }),
  ],
};
