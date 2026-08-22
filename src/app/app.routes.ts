import { Routes } from '@angular/router';
import { compareLinkMatcher, profileLinkMatcher } from './legacy-links';

export const routes: Routes = [
  // Legacy data links first — see legacy-links.ts.
  {
    matcher: profileLinkMatcher,
    loadComponent: () => import('./profile/profile.component').then((m) => m.ProfileComponent),
  },
  {
    matcher: compareLinkMatcher,
    loadComponent: () => import('./compare/compare.component').then((m) => m.CompareComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'home',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'survey',
    loadComponent: () => import('./survey/survey.component').then((m) => m.SurveyComponent),
  },
  {
    path: 'share',
    loadComponent: () => import('./share/share.component').then((m) => m.ShareComponent),
  },
  {
    path: 'compare',
    loadComponent: () => import('./compare/compare.component').then((m) => m.CompareComponent),
  },
  {
    path: 'vault',
    loadComponent: () => import('./vault/vault.component').then((m) => m.VaultComponent),
  },
  {
    path: 'about',
    loadComponent: () => import('./about/about.component').then((m) => m.AboutComponent),
  },
  { path: '**', redirectTo: 'home' },
];
