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
    expect(navLabels(el)).toEqual([
      'Profile',
      'Menagerie',
      'Groups',
      'Compare',
      'Settings',
      'How it works',
    ]);
    // The session is legible from every page — the thing that used to make
    // navigating to Compare feel like being logged out.
    expect(el.querySelector('.session-chip')?.textContent).toContain('amber-azure-fox');
    expect(el.textContent).toContain('Log out');
  });
});
