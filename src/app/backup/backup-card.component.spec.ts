import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BackupCardComponent } from './backup-card.component';
import { routes } from '../app.routes';
import { ProfileSessionStore } from '../stores/profile-session.store';

const VIEW = 'brave-azure-otter-mistwoven-emberlit-fernhollow';
const EDIT = 'implosive widow buckskin earthy parted';

describe('the backup card', () => {
  function render() {
    const session = TestBed.inject(ProfileSessionStore);
    session.active.set(true);
    session.viewPhrase.set(VIEW);
    session.editPhrase.set(EDIT);
    session.persona.set({
      words: ['brave', 'azure', 'otter'],
      name: 'brave-azure-otter',
      emoji: '🦦',
      color: '#0b5e8a',
      color2: '#1e5f9e',
      colorIndex: 11,
    });
    const fixture = TestBed.createComponent(BackupCardComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BackupCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  // The whole point of the card: if either phrase is missing, printing it is
  // worse than useless — it looks like a backup and isn't one.
  it('carries both phrases and the creature', () => {
    const el = render();
    expect(el.querySelector('.code-box')?.textContent).toContain(VIEW);
    expect(el.querySelector('.passphrase-box')?.textContent).toContain(EDIT);
    expect(el.querySelector('moxy-creature-avatar')).not.toBeNull();
    expect(el.textContent).toContain('brave-azure-otter');
  });

  it('renders the view QR, not a bare link', () => {
    expect(render().querySelector('moxy-qr-code')).not.toBeNull();
  });

  // Printing the edit phrase hands someone full control on paper. Saying so
  // is not optional, and it must survive a copy edit of the surrounding page.
  it('warns that the card carries full edit control', () => {
    const warning = render().querySelector('.notice-warn');
    expect(warning?.textContent).toContain('edit phrase');
    expect(warning?.textContent?.toLowerCase()).toContain('delete this profile');
  });

  // The card is the print target; the surrounding controls are not.
  it('marks the screen-only controls as no-print', () => {
    const el = render();
    const controls = el.querySelector('.no-print');
    expect(controls?.textContent).toContain('Print or save as PDF');
    expect(el.querySelector('.backup-card')?.classList.contains('no-print')).toBe(false);
  });

  // A view-only visitor must never reach a page that prints an edit phrase.
  it('is reachable only behind the session guard', () => {
    const route = routes.find((r) => r.path === 'backup');
    expect(route).toBeDefined();
    expect(route?.canActivate?.length).toBeGreaterThan(0);
  });

  it('says nothing about phrases when there is no session', () => {
    const fixture = TestBed.createComponent(BackupCardComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.passphrase-box')).toBeNull();
    expect(el.textContent).toContain('No session');
  });
});
