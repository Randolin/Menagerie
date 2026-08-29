import { inject } from '@angular/core';
import { type CanDeactivateFn } from '@angular/router';
import { ProfileSessionStore } from './stores/profile-session.store';

/**
 * Answers live in memory until an explicit save, so leaving the editor with a
 * dirty draft silently discards it. This is the in-app half of that guard;
 * the dashboard's beforeunload handler covers closing the tab.
 *
 * Deliberately a plain confirm(): the alternative is a modal that has to
 * intercept the router's navigation mid-flight, and a native dialog cannot be
 * missed or mis-styled. Answering "leave" discards, which is what the router
 * would have done anyway.
 */
export const unsavedChangesGuard: CanDeactivateFn<unknown> = () => {
  const session = inject(ProfileSessionStore);
  if (!session.dirty()) return true;
  return confirm($localize`You have unsaved answers. Leave this page and lose them?`);
};
