import { TestBed } from '@angular/core/testing';
import { unsavedChangesGuard } from './unsaved-changes.guard';
import { ProfileSessionStore } from './stores/profile-session.store';
import { DraftStore } from './stores/draft.store';

/**
 * The guard is the only thing between an unsaved draft and the router
 * throwing it away, so both branches are worth pinning — including that a
 * clean draft never nags, which is what makes the prompt believable when it
 * does appear.
 */
describe('unsavedChangesGuard', () => {
  let confirmed: boolean;
  let asked: number;
  const realConfirm = globalThis.confirm;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    asked = 0;
    confirmed = false;
    globalThis.confirm = () => {
      asked++;
      return confirmed;
    };
  });

  afterEach(() => {
    globalThis.confirm = realConfirm;
  });

  function run(): boolean {
    return TestBed.runInInjectionContext(
      () => unsavedChangesGuard(null, null!, null!, null!) as boolean,
    );
  }

  it('lets a clean draft leave without asking', () => {
    expect(run()).toBe(true);
    expect(asked).toBe(0);
  });

  it('asks when the draft is dirty, and honours the answer', () => {
    TestBed.inject(DraftStore).answers.set({ 'ab.age': 1 });
    expect(TestBed.inject(ProfileSessionStore).dirty()).toBe(true);

    expect(run()).toBe(false);
    expect(asked).toBe(1);

    confirmed = true;
    expect(run()).toBe(true);
    expect(asked).toBe(2);
  });
});
