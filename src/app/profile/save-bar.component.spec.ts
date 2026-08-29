import { TestBed } from '@angular/core/testing';
import { MemoryStorage } from '@moxy/core';
import { SaveBarComponent } from './save-bar.component';
import { APP_STORAGE } from '../stores/storage.token';
import { DraftStore } from '../stores/draft.store';
import { DraftVault } from '../stores/draft-vault';
import { ProfileSessionStore } from '../stores/profile-session.store';

/**
 * Offline is the one save failure where nothing is wrong and nothing is lost,
 * and the bar is where that gets said. What's pinned here is that it says the
 * true thing — which depends on whether the draft is kept on the device — and
 * that it never dresses waiting up as an error.
 */
describe('the save bar', () => {
  let session: ProfileSessionStore;
  let draft: DraftStore;
  let vault: DraftVault;

  function render(): string {
    const fixture = TestBed.createComponent(SaveBarComponent);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaveBarComponent],
      providers: [{ provide: APP_STORAGE, useValue: new MemoryStorage() }],
    }).compileComponents();
    session = TestBed.inject(ProfileSessionStore);
    draft = TestBed.inject(DraftStore);
    vault = TestBed.inject(DraftVault);
    draft.set('ls.alcohol', 2);
  });

  it('asks for a save while there is something to save', () => {
    expect(render()).toContain('You have unsaved answers');
  });

  it('says nothing at all once the draft matches the server', () => {
    draft.clear();
    expect(render()).toBe('');
  });

  it('replaces the prompt with the offline state, and offers a retry', () => {
    session.saveState.set('offline');
    const text = render();
    expect(text).toContain('Offline');
    expect(text).toContain('Try again');
    expect(text).not.toContain('You have unsaved answers');
    // "Save now" would be a lie: there is nothing to save to.
    expect(text).not.toContain('Save now');
  });

  it('tells someone with no kept draft to leave the tab open', () => {
    session.saveState.set('offline');
    const text = render();
    expect(text).toContain('safe in this tab');
    expect(text).toContain('Leave it open');
  });

  it('tells someone with a kept draft that the device has it', async () => {
    vault.arm(
      await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ]),
    );
    await vault.setEnabled(true);
    session.saveState.set('offline');
    const text = render();
    expect(text).toContain('kept on this device');
    expect(text).not.toContain('Leave it open');
  });
});
