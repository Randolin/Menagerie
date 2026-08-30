import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { ProfileSessionStore } from './stores/profile-session.store';

describe('App shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  function navLabels(el: HTMLElement): string[] {
    return [...el.querySelectorAll('.nav a')].map((a) => a.textContent?.trim() ?? '');
  }

  it('renders the brand', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brand')?.textContent).toContain('Menagerie');
  });

  // Viewing and comparing need no session, so those stay; everything that
  // requires the edit phrase is hidden rather than offered and then bounced.
  it('signed out: only the public destinations, and a way in', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(navLabels(el)).toEqual(['Compare', 'How it works']);
    expect(el.querySelector('.session-chip')).toBeNull();
    expect(el.textContent).toContain('Log in');
  });

  it('signed in: profile destinations appear, with the creature and a way out', () => {
    const session = TestBed.inject(ProfileSessionStore);
    session.active.set(true);
    session.persona.set({
      words: ['amber', 'azure', 'fox'],
      name: 'amber-azure-fox',
      emoji: '🦊',
      color: '#0b5e8a',
      color2: '#1e5f9e',
      colorIndex: 11,
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    // The creature IS the profile link: identity and destination used to be
    // two controls, and the identity one read as a button that went where the
    // Profile link already went.
    expect(navLabels(el)).toEqual([
      'amber-azure-fox',
      'Menagerie',
      'Groups',
      'Compare',
      'Settings',
      'How it works',
    ]);
    // The session is legible from every page — the thing that used to make
    // navigating to Compare feel like being logged out.
    const chip = el.querySelector('.session-chip');
    expect(chip?.textContent).toContain('amber-azure-fox');
    expect(chip?.getAttribute('href')).toBe('/me');
    expect(chip?.querySelector('mng-creature-avatar')).not.toBeNull();
    expect(el.textContent).toContain('Log out');
  });

  // A hash-routed SPA announces nothing on its own and leaves focus on the
  // link that was activated, so the shell has to do both jobs itself.
  describe('keyboard and screen-reader shell', () => {
    it('offers a skip link that moves focus into the content', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;

      const skip = el.querySelector<HTMLButtonElement>('button.skip-link');
      expect(skip?.textContent?.trim()).toBe('Skip to content');

      skip?.click();
      expect(document.activeElement?.id).toBe('view');
    });

    it('makes the content focusable without putting it in the tab order', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const main = fixture.nativeElement.querySelector('main#view');
      expect(main?.getAttribute('tabindex')).toBe('-1');
    });

    it('carries a polite live region for route announcements', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const live = fixture.nativeElement.querySelector('[aria-live]');
      expect(live?.getAttribute('aria-live')).toBe('polite');
      expect(live?.getAttribute('role')).toBe('status');
      // Screen-reader only: it must never be visible.
      expect(live?.classList.contains('sr-only')).toBe(true);
    });
  });
});

// Every page needs a name: the tab, browser history, and the live region all
// read it. Only the landing page opts out — its name is the brand.
describe('route titles', () => {
  it('names every route but the landing page and the catch-all', () => {
    const unnamed = routes
      .filter((route) => route.path !== '' && route.path !== '**')
      .filter((route) => !route.title)
      .map((route) => route.path);
    expect(unnamed).toEqual([]);
  });
});
