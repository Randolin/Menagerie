import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MemoryStorage, type BoopReachability, type Persona } from '@moxy/core';
import { signal } from '@angular/core';
import { CompareComponent } from './compare.component';
import { CompareStore } from '../stores/compare.store';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { APP_STORAGE } from '../stores/storage.token';
import type { CompareModel, CompareSlot } from './compare-model';

const MINE = 'brave-azure-otter-mistwoven-emberlit-fernhollow';
const THEIRS = 'calm-bright-owl-moonlit-honeywarmed-willowbrook';
const REACH: BoopReachability = { pub: 'PUB', inbox: 'INBOX' };

function persona(name: string): Persona {
  return {
    words: name.split('-').slice(0, 3) as unknown as Persona['words'],
    name: name.split('-').slice(0, 3).join('-'),
    emoji: '🦦',
    color: '#0b5e8a',
    color2: '#1e5f9e',
    colorIndex: 11,
  };
}

function slot(ref: string, opts: { reach?: BoopReachability; broken?: boolean } = {}): CompareSlot {
  if (opts.broken) return { ref, error: 'nope' };
  return {
    ref,
    payload: { v: 2, a: { 'ab.age': 1 }, ...(opts.reach ? { k: opts.reach } : {}) },
    persona: persona(ref),
  };
}

function model(slots: readonly CompareSlot[]): CompareModel {
  const good = slots.filter((s) => s.payload);
  return {
    slots,
    payloads: good.map((s) => s.payload!),
    names: good.map((s) => s.persona!.name),
    emojis: good.map((s) => s.persona!.emoji),
    grid: [],
    pair: null,
    interlocks: [],
    pairwise: [],
    mutualSeekingCount: 0,
    desireRows: [],
    withTokensCount: 0,
  };
}

/**
 * The share-back offer is the loop's last step, so what matters is not that
 * it renders but that it stays silent in every situation where the offer
 * would be wrong: a comparison you are not part of, a third party, someone
 * unreachable, and someone you already sent your creature to.
 */
describe('the share-back offer', () => {
  let store: { model: ReturnType<typeof signal<CompareModel | undefined>> } & Record<
    string,
    unknown
  >;
  let session: ProfileSessionStore;

  function render(): string {
    const fixture = TestBed.createComponent(CompareComponent);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  beforeEach(async () => {
    store = {
      model: signal<CompareModel | undefined>(undefined),
      entries: signal([]),
      full: false,
      remove: () => undefined,
      clear: () => undefined,
      addPhrase: () => true,
      addFromText: () => true,
    };
    await TestBed.configureTestingModule({
      imports: [CompareComponent],
      providers: [
        provideRouter([]),
        { provide: APP_STORAGE, useValue: new MemoryStorage() },
        { provide: CompareStore, useValue: store },
      ],
    }).compileComponents();

    session = TestBed.inject(ProfileSessionStore);
    session.active.set(true);
    session.viewPhrase.set(MINE);
  });

  it('offers to send your creature back after a two-way comparison', () => {
    store.model.set(model([slot(MINE), slot(THEIRS, { reach: REACH })]));
    const text = render();
    expect(text).toContain('Send your creature back');
    // Names the tick rather than performing it: the panel proposes only.
    expect(text).toContain('Include my view phrase');
    // States how comparisons work; never claims to know what they hold.
    expect(text).toContain('if they don’t have yours');
  });

  it('says nothing about whether they are waiting or watching', () => {
    store.model.set(model([slot(MINE), slot(THEIRS, { reach: REACH })]));
    const text = render().toLowerCase();
    for (const forbidden of ['waiting', 'hasn’t seen', 'has not seen', 'still hasn', 'viewed']) {
      expect(text, forbidden).not.toContain(forbidden);
    }
  });

  it('stays silent in a comparison you are not part of', () => {
    store.model.set(model([slot(THEIRS, { reach: REACH }), slot('a-b-c-d-e-f', { reach: REACH })]));
    expect(render()).not.toContain('Send your creature back');
  });

  it('stays silent for three profiles, where there is no single "them"', () => {
    store.model.set(
      model([slot(MINE), slot(THEIRS, { reach: REACH }), slot('a-b-c-d-e-f', { reach: REACH })]),
    );
    expect(render()).not.toContain('Send your creature back');
  });

  it('stays silent when the other profile cannot be booped', () => {
    // A group snapshot or a profile that predates boops: no reachability.
    store.model.set(model([slot(MINE), slot(THEIRS)]));
    expect(render()).not.toContain('Send your creature back');
  });

  it('stays silent once this profile has already booped that creature', () => {
    session.sentBoops.set([
      {
        id: 'b1',
        label: persona(THEIRS).name,
        emoji: '🦉',
        replyBox: { locator: 'L', token: 'T', key: 'K' },
        sentAt: 1,
        status: 'sent',
      },
    ]);
    store.model.set(model([slot(MINE), slot(THEIRS, { reach: REACH })]));
    expect(render()).not.toContain('Send your creature back');
  });

  it('survives the composer writing the ledger the moment it opens', () => {
    store.model.set(model([slot(MINE), slot(THEIRS, { reach: REACH })]));
    const fixture = TestBed.createComponent(CompareComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Send your creature back');

    // prepareBoop records the sent boop when the composer OPENS, not when it
    // sends. Read live, that ledger write would delete the panel out from
    // under someone mid-boop, taking their draft and their confirmation.
    session.sentBoops.set([
      {
        id: 'b1',
        label: persona(THEIRS).name,
        emoji: '🦉',
        replyBox: { locator: 'L', token: 'T', key: 'K' },
        sentAt: 1,
        status: 'pending',
      },
    ]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Send your creature back');

    // A different pair re-reads the ledger, so the offer stands down there.
    store.model.set(model([slot(MINE), slot(THEIRS, { reach: { pub: 'P2', inbox: 'INBOX2' } })]));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'Send your creature back',
    );
  });

  it('stays silent when logged out, since there is no creature to send', () => {
    session.active.set(false);
    store.model.set(model([slot(MINE), slot(THEIRS, { reach: REACH })]));
    expect(render()).not.toContain('Send your creature back');
  });

  it('is not part of the printable document', () => {
    store.model.set(model([slot(MINE), slot(THEIRS, { reach: REACH })]));
    const fixture = TestBed.createComponent(CompareComponent);
    fixture.detectChanges();
    const panel = (fixture.nativeElement as HTMLElement).querySelector('moxy-share-back .card');
    expect(panel?.classList.contains('no-print')).toBe(true);
  });
});
