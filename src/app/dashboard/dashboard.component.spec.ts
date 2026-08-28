import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { coreItems, MemoryStorage, type Persona } from '@moxy/core';
import { DashboardComponent } from './dashboard.component';
import { APP_STORAGE } from '../stores/storage.token';
import { DraftStore } from '../stores/draft.store';
import { ProfileSessionStore } from '../stores/profile-session.store';

const PERSONA: Persona = {
  words: ['brave', 'azure', 'otter'] as const,
  name: 'brave-azure-otter',
  emoji: '🦦',
  color: '#0b5e8a',
  color2: '#1e5f9e',
  colorIndex: 11,
};

describe('the dashboard', () => {
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([]), { provide: APP_STORAGE, useValue: storage }],
    }).compileComponents();

    const session = TestBed.inject(ProfileSessionStore);
    session.active.set(true);
    session.viewPhrase.set('brave-azure-otter-mistwoven-emberlit-fernhollow');
    session.editPhrase.set('implosive widow buckskin earthy parted');
    session.persona.set(PERSONA);
  });

  /** Answer every core item, which is what the milestone waits for. */
  function completeCore(): void {
    const draft = TestBed.inject(DraftStore);
    const answers: Record<string, number> = {};
    for (const { item } of coreItems()) answers[item.id] = 0;
    draft.answers.set(answers);
  }

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  function dismissPhraseNotice(): void {
    storage.setItem(`moxy.hatch.notice.${PERSONA.name}`, '1');
  }

  it('sends people somewhere real to save the edit phrase', () => {
    const el = render();
    const backup = [...el.querySelectorAll('a')].find((a) => a.textContent?.includes('backup'));
    expect(backup?.getAttribute('href')).toBe('/backup');
  });

  it('says nothing about a milestone before the core is done', () => {
    dismissPhraseNotice();
    expect(render().textContent).not.toContain('Your core set is done');
  });

  // Two loud cards on one screen costs the more important one its attention,
  // and losing the edit phrase is the more important one.
  it('waits for the edit-phrase notice to be cleared', () => {
    completeCore();
    expect(render().textContent).not.toContain('Your core set is done');
  });

  it('marks the moment once the core is done and the phrase is saved', () => {
    completeCore();
    dismissPhraseNotice();
    const el = render();
    expect(el.textContent).toContain('Your core set is done');
    // The point of the moment: a finished profile still compares against
    // nothing until someone else's phrase arrives.
    expect(el.textContent).toContain('a comparison needs two profiles');
    expect(el.textContent).toContain('Copy my view link');
  });

  it('stays dismissed for this creature across a reload', () => {
    completeCore();
    dismissPhraseNotice();
    storage.setItem(`moxy.core.milestone.${PERSONA.name}`, '1');
    expect(render().textContent).not.toContain('Your core set is done');
  });
});
