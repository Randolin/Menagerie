import { Routes } from '@angular/router';
import { hatchSessionGuard } from './hatch-session.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./landing/landing.component').then((m) => m.LandingComponent),
  },
  // The QR bypass: scanning a code lands here directly, no landing page.
  {
    path: 'view/:phrase',
    loadComponent: () => import('./view/view.component').then((m) => m.ViewComponent),
  },
  {
    path: 'edit',
    loadComponent: () =>
      import('./edit-login/edit-login.component').then((m) => m.EditLoginComponent),
  },
  // Group invites deep-link like view QRs: anyone with the phrase can look.
  {
    path: 'group/:phrase',
    loadComponent: () => import('./group/group.component').then((m) => m.GroupComponent),
  },
  {
    path: 'me',
    canActivate: [hatchSessionGuard],
    loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'me/pack/:id',
    canActivate: [hatchSessionGuard],
    loadComponent: () =>
      import('./pack-runner/pack-runner.component').then((m) => m.PackRunnerComponent),
  },
  {
    path: 'me/section/:id',
    canActivate: [hatchSessionGuard],
    loadComponent: () =>
      import('./section-editor/section-editor.component').then((m) => m.SectionEditorComponent),
  },
  {
    path: 'compare',
    loadComponent: () => import('./compare/compare.component').then((m) => m.CompareComponent),
  },
  {
    path: 'about',
    loadComponent: () => import('./about/about.component').then((m) => m.AboutComponent),
  },
  { path: '**', redirectTo: '' },
];
