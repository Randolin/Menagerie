import { Routes } from '@angular/router';
import { hatchSessionGuard } from './hatch-session.guard';
import { unsavedChangesGuard } from './unsaved-changes.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./landing/landing.component').then((m) => m.LandingComponent),
  },
  // The QR bypass: scanning a code lands here directly, no landing page.
  {
    path: 'view/:phrase',
    title: 'Profile',
    loadComponent: () => import('./view/view.component').then((m) => m.ViewComponent),
  },
  {
    path: 'edit',
    title: 'Log in',
    loadComponent: () =>
      import('./edit-login/edit-login.component').then((m) => m.EditLoginComponent),
  },
  // Group invites deep-link like view QRs: anyone with the phrase can look.
  {
    path: 'group/:phrase',
    title: 'Group',
    loadComponent: () => import('./group/group.component').then((m) => m.GroupComponent),
  },
  {
    path: 'me',
    canActivate: [hatchSessionGuard],
    canDeactivate: [unsavedChangesGuard],
    title: 'My profile',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'menagerie',
    canActivate: [hatchSessionGuard],
    title: 'My menagerie',
    loadComponent: () =>
      import('./menagerie/menagerie.component').then((m) => m.MenagerieComponent),
  },
  {
    path: 'groups',
    canActivate: [hatchSessionGuard],
    title: 'Groups',
    loadComponent: () => import('./groups/groups.component').then((m) => m.GroupsComponent),
  },
  {
    path: 'settings',
    canActivate: [hatchSessionGuard],
    title: 'Settings',
    loadComponent: () => import('./settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'compare',
    title: 'Compare',
    loadComponent: () => import('./compare/compare.component').then((m) => m.CompareComponent),
  },
  {
    path: 'community',
    title: 'Community',
    loadComponent: () =>
      import('./community/community.component').then((m) => m.CommunityComponent),
  },
  {
    path: 'about',
    title: 'How it works',
    loadComponent: () => import('./about/about.component').then((m) => m.AboutComponent),
  },
  {
    path: 'creatures',
    title: 'Creatures',
    loadComponent: () =>
      import('./creatures/creatures.component').then((m) => m.CreaturesComponent),
  },
  { path: '**', redirectTo: '' },
];
