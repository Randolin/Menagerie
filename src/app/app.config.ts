import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { routes } from './app.routes';
import { provideComparePanel } from './compare/compare-panels.token';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Hash location keeps the site deployable on any static host with no
    // rewrite rules AND keeps every legacy link (#/survey, #p=…, #c=…)
    // working natively.
    provideRouter(routes, withHashLocation()),

    // The compare view's datavis panels. Adding a new chart format is one
    // standalone component + one provideComparePanel() line here.
    provideComparePanel({
      id: 'headline',
      order: 10,
      loadComponent: () => import('./compare/panels/headline.panel').then((m) => m.HeadlinePanel),
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
      id: 'answer-grid',
      order: 50,
      loadComponent: () =>
        import('./compare/panels/answer-grid.panel').then((m) => m.AnswerGridPanel),
    }),
  ],
};
