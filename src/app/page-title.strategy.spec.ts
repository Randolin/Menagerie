import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, TitleStrategy } from '@angular/router';
import { App } from './app';
import { PageTitleStrategy } from './page-title.strategy';

@Component({ selector: 'mng-stub-page', template: '<h1>stub</h1>' })
class StubPage {}

/**
 * The shell's navigation behaviour, driven through a real router rather than
 * the app's own routes: what matters here is what happens on a navigation,
 * not which pages exist.
 */
describe('navigating', () => {
  let router: Router;
  let strategy: PageTitleStrategy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', title: 'First', component: StubPage },
          { path: 'second', title: 'Second', component: StubPage },
          { path: 'nameless', component: StubPage },
        ]),
        { provide: TitleStrategy, useExisting: PageTitleStrategy },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    strategy = TestBed.inject(PageTitleStrategy);
  });

  it('names the tab and announces the page', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigate(['/second']);
    fixture.detectChanges();

    expect(document.title).toBe('Second — Menagerie');
    expect(strategy.announcement()).toBe('Second page');
    expect(fixture.nativeElement.querySelector('[aria-live]').textContent).toContain('Second page');
  });

  it('falls back to the brand where a route has no title', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigate(['/nameless']);
    fixture.detectChanges();

    expect(document.title).toBe('Menagerie — anonymous compatibility profiles');
    expect(strategy.announcement()).toBe('Menagerie home page');
  });

  // The first navigation IS the page load: the browser's focus is already
  // where it belongs and moving it would be an unrequested jump.
  it('leaves focus alone on the first navigation, then follows every one after', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigate(['/']);
    fixture.detectChanges();
    expect(document.activeElement?.id).not.toBe('view');

    await router.navigate(['/second']);
    fixture.detectChanges();
    expect(document.activeElement?.id).toBe('view');
  });
});
