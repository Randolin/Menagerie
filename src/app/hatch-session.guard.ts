import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { ProfileSessionStore } from './stores/profile-session.store';

/** /me routes need a live session; otherwise try to restore one, else login. */
export const hatchSessionGuard: CanActivateFn = async () => {
  const session = inject(ProfileSessionStore);
  const router = inject(Router);
  if (session.active() || (await session.restore())) return true;
  return router.createUrlTree(['/edit']);
};
