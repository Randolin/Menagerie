import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  GC_EMPTY_HUMAN,
  GC_IDLE_HUMAN,
  SECTIONS,
  coreItems,
  extractGroupPhrase,
  extractViewPhrase,
  visiblePacks,
  type Pack,
} from '@moxy/core';
import { PersonaChipComponent, QrCodeComponent, RingComponent, ToastService, copyText } from '@moxy/ui';
import { APP_STORAGE } from '../stores/storage.token';
import { DraftStore } from '../stores/draft.store';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { CompareStore } from '../stores/compare.store';

@Component({
  selector: 'moxy-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PersonaChipComponent, QrCodeComponent, RingComponent],
  template: `
    @if (!noticeDismissed()) {
      <div class="card" style="border-color:var(--accent)">
        <h2>🔑 Your edit phrase — save it now</h2>
        <p class="sub">
          This phrase is the <strong>only</strong> way to edit this profile. It’s shown
          here until you dismiss this notice, and after that only lives wherever you put it.
          No account, no email, no reset — if it’s lost, the profile can never be edited again.
        </p>
        <div class="passphrase-box">{{ session.editPhrase() }}</div>
        <p class="fine">
          Housekeeping: profiles with no saved answers are deleted after
          {{ gcEmpty }}; profiles untouched and unviewed for {{ gcIdle }} are deleted too.
          Saving anything, or anyone viewing you, keeps yours alive.
        </p>
        <div class="btn-row">
          <button class="btn" (click)="copy(session.editPhrase()!, 'Copied — store it somewhere safe')">
            📋 Copy edit phrase
          </button>
          <button class="btn btn-primary" (click)="dismissNotice()">I’ve saved it</button>
        </div>
      </div>
    }

    <div class="card">
      <h2 style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        My profile
        @if (session.persona(); as persona) { <moxy-persona-chip [persona]="persona" /> }
        <button class="btn btn-ghost btn-small" (click)="regenerate()">🎲 New creature</button>
      </h2>
      <p class="sub">
        Share the phrase, the link, or the QR code — all three carry the same view-only
        credential. Your creature is its first three words; anyone who can see your
        profile can recognize it. A new creature is a whole new phrase: every previously
        shared link and QR stops working.
      </p>
      <div class="share-grid">
        <div>
          <div class="code-box">{{ session.viewPhrase() }}</div>
          <div class="btn-row" style="margin-top:12px">
            <button class="btn btn-primary" (click)="copy(session.viewUrl()!, 'View link copied')">
              📋 Copy view link
            </button>
            <button class="btn" (click)="copy(session.viewPhrase()!, 'View phrase copied')">
              Copy just the phrase
            </button>
          </div>
          <p class="fine" style="margin-top:10px">
            {{ session.populated() ? 'Viewers see only the sections you’ve saved.'
               : 'Nothing is filled in yet — viewers would see an empty profile.' }}
          </p>
        </div>
        @if (session.viewUrl(); as url) {
          <moxy-qr-code [text]="url" [persona]="session.persona()" />
        }
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:18px 4px 10px">
      <h2 style="margin:0">Question packs</h2>
      <span class="fine core-marker" [class.core-done]="coreDone()">
        <moxy-ring [fraction]="coreFraction()" [size]="20" label="core completion" />
        {{ coreDone()
            ? 'Core complete — comparisons have their footing'
            : 'Core ' + coreAnswered() + ' of ' + coreTotal + ' — comparisons work best from a full core' }}
      </span>
    </div>
    <div class="section-grid">
      @for (p of packs(); track p.id) {
        <a class="card section-card" [routerLink]="['/me/pack', p.id]">
          <h3 style="display:flex;align-items:center;gap:8px">
            <span>{{ p.emoji }} {{ p.title }}</span>
            <span style="margin-left:auto">
              <moxy-ring [fraction]="packFraction(p)" [size]="26"
                         [label]="p.title + ' completion'" />
            </span>
          </h3>
          <p class="sub">{{ p.blurb }}</p>
          <span class="fine">
            {{ draft.answeredAmong(p.itemIds) }} of {{ p.itemIds.length }} answered — run →
          </span>
        </a>
      }
    </div>
    @if (session.dirty()) {
      <p class="fine" style="margin:8px 4px">
        You have unsaved edits — finish a pack or hit “Save” in a section to publish them.
      </p>
    }
    <details style="margin:4px">
      <summary class="fine" style="cursor:pointer">Review all answers by section (and set importance)</summary>
      <div class="section-grid" style="margin-top:10px">
        @for (s of sections; track s.id) {
          <a class="card section-card" [routerLink]="['/me/section', s.id]">
            <h3>{{ s.title }} @if (s.privacy === 'match') { <span class="fine">🔒 mutual-only</span> }</h3>
            <span class="fine">
              {{ draft.answeredIn(s) }} of {{ s.items.length }} answered — review →
            </span>
          </a>
        }
      </div>
    </details>

    <div class="card">
      <h2>My menagerie</h2>
      <p class="sub">
        The creatures you’ve collected — keep view phrases you’ve been given and compare
        them against your own profile. Your menagerie is encrypted with your edit key;
        the server never sees who’s in it.
      </p>
      @for (c of session.connections(); track c.id) {
        <div class="grid-row" style="align-items:center">
          <div class="grid-item-label">{{ c.label }}</div>
          <div class="grid-answers" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="fine">{{ c.viewPhrase }}</span>
            <button class="btn btn-small" (click)="compareWith(c.viewPhrase)">Compare</button>
            <a class="btn btn-ghost btn-small" [routerLink]="['/view', c.viewPhrase]">View</a>
            <button class="btn btn-ghost btn-small" [attr.aria-label]="'Remove ' + c.label"
                    (click)="removeConnection(c.id)">✕</button>
          </div>
        </div>
      }
      <form style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"
            (submit)="addConnection($event, nameInput, phraseInput)">
        <input #nameInput type="text" placeholder="Name (for you only)"
               aria-label="Connection name" style="min-width:150px">
        <input #phraseInput type="text" placeholder="Their view phrase or link"
               aria-label="Connection view phrase" style="flex:1;min-width:220px">
        <button class="btn">Add</button>
      </form>
    </div>

    <div class="card">
      <h2>My groups</h2>
      <p class="sub">
        A group is a shared, encrypted roster with its own creature and invite QR.
        Members deposit a snapshot of their open answers — pseudonymously, or openly
        with their creature — and everyone in it can compare across the roster.
      </p>
      @if (newGroup(); as created) {
        <div class="notice">
          Your group is hatched. Share the <strong>invite link</strong>; keep the
          <strong>admin phrase</strong> — it’s the only way to manage or re-mint the group
          (it’s also saved inside your encrypted profile):
          <div class="passphrase-box" style="margin-top:8px">{{ created.adminPhrase }}</div>
        </div>
      }
      @for (g of session.groups(); track g.id) {
        <div class="grid-row" style="align-items:center">
          <div class="grid-item-label">
            {{ groupName(g.groupPhrase) }}
            @if (g.adminPhrase) { <span class="fine">creator</span> }
            @if (g.memberLocator) {
              <span class="fine">{{ g.tier === 2 ? 'open' : 'as ' + (g.emoji ?? '') + ' ' + (g.pseudonym ?? 'pseudonym') }}</span>
            } @else {
              <span class="fine">not deposited</span>
            }
          </div>
          <div class="grid-answers" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <a class="btn btn-small" [routerLink]="['/group', g.groupPhrase]">Open</a>
          </div>
        </div>
      }
      <form style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"
            (submit)="openGroup($event, groupInput)">
        <input #groupInput type="text" placeholder="Paste a group invite link or phrase"
               aria-label="Group invite link or phrase" style="flex:1;min-width:220px">
        <button class="btn">Open group</button>
        <button class="btn btn-primary" type="button" [disabled]="creatingGroup()"
                (click)="createGroup()">
          {{ creatingGroup() ? 'Hatching…' : '🐣 Create a group' }}
        </button>
      </form>
    </div>

    <div class="card">
      <h2>Contribute anonymously</h2>
      <p class="sub">
        Once a month, opted-in profiles add coarse counts to a public,
        <a routerLink="/community">community-wide picture</a> — age band plus
        bucketed answers, never your name, creature, phrases, or anything the server
        could tie back to this profile. Desire counts are submitted with random noise,
        so even the server can’t know any single answer was real. Buckets with fewer
        than ten contributors are never shown.
      </p>
      <label class="fine" style="display:flex;gap:8px;align-items:center">
        <input type="checkbox" [checked]="session.metricsOptIn()"
               (change)="toggleMetrics($event)">
        Count my answers in the anonymous community stats
      </label>
    </div>

    <div class="card">
      <h2>Keys &amp; housekeeping</h2>
      <label class="fine" style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
        <input type="checkbox" [checked]="session.remembered()"
               (change)="toggleRemember($event)">
        Remember my edit phrase on this device — stored unencrypted in this browser
      </label>
      @if (newEditPhrase(); as phrase) {
        <div class="notice">
          Your <strong>new edit phrase</strong> — the old one is dead. Save this one now:
          <div class="passphrase-box" style="margin-top:8px">{{ phrase }}</div>
        </div>
      }
      <div class="btn-row">
        <button class="btn" (click)="changeEditPhrase()">Change edit phrase</button>
        <button class="btn btn-ghost" (click)="logout()">Log out on this device</button>
        <button class="btn btn-danger" (click)="deleteProfile()">Delete profile forever</button>
      </div>
    </div>
  `,
  styles: `
    .section-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      gap: 14px;
      margin-bottom: 16px;
    }
    .section-card { margin: 0; display: flex; flex-direction: column; gap: 6px; text-decoration: none; color: inherit; }
    .section-card:hover { border-color: var(--accent); }
    .section-card h3 { margin: 0; font-size: 17px; }
    .section-card .sub { flex: 1; margin: 0; }
    .core-marker { display: inline-flex; align-items: center; gap: 6px; }
    .core-done { color: var(--accent); }
  `,
})
export class DashboardComponent {
  protected readonly session = inject(ProfileSessionStore);
  protected readonly draft = inject(DraftStore);
  private readonly compare = inject(CompareStore);
  private readonly storage = inject(APP_STORAGE);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly sections = SECTIONS;
  protected readonly gcEmpty = GC_EMPTY_HUMAN;
  protected readonly gcIdle = GC_IDLE_HUMAN;
  protected readonly newEditPhrase = signal<string | null>(null);
  protected readonly newGroup = signal<{ groupPhrase: string; adminPhrase: string } | null>(null);
  protected readonly creatingGroup = signal(false);

  protected readonly packs = computed(() => visiblePacks(this.draft.answers()));
  private readonly coreIds = coreItems().map(({ item }) => item.id);
  protected readonly coreTotal = this.coreIds.length;
  protected readonly coreAnswered = computed(() => this.draft.answeredAmong(this.coreIds));
  protected readonly coreFraction = computed(() =>
    this.coreTotal === 0 ? 0 : this.coreAnswered() / this.coreTotal,
  );
  protected readonly coreDone = computed(() => this.coreAnswered() === this.coreTotal);

  protected packFraction(p: Pack): number {
    return p.itemIds.length === 0 ? 0 : this.draft.answeredAmong(p.itemIds) / p.itemIds.length;
  }

  private readonly dismissalSeen = signal(0);
  protected readonly noticeDismissed = computed(() => {
    this.dismissalSeen();
    const persona = this.session.persona();
    if (!persona) return true;
    try {
      return this.storage.getItem(this.noticeKey(persona.name)) === '1';
    } catch {
      return true;
    }
  });

  protected dismissNotice(): void {
    const persona = this.session.persona();
    if (!persona) return;
    try {
      this.storage.setItem(this.noticeKey(persona.name), '1');
    } catch {
      /* fine */
    }
    this.dismissalSeen.update((n) => n + 1);
  }

  private noticeKey(personaName: string): string {
    return `moxy.hatch.notice.${personaName}`;
  }

  protected async copy(text: string, okMessage: string): Promise<void> {
    this.toast.show((await copyText(text)) ? okMessage : 'Copy failed — select it manually');
  }

  protected async regenerate(): Promise<void> {
    const sure = confirm(
      'Pick a new creature? Your view phrase changes, and every link and QR code you ' +
        'have already shared stops working. Your answers and edit phrase stay.',
    );
    if (!sure) return;
    try {
      await this.session.regenerateViewPhrase();
      this.toast.show('New creature hatched — old links are dead');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected async changeEditPhrase(): Promise<void> {
    const sure = confirm(
      'Mint a new edit phrase? The current one stops working immediately.',
    );
    if (!sure) return;
    try {
      this.newEditPhrase.set(await this.session.changeEditPhrase());
      this.toast.show('Edit phrase changed — save the new one now');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected toggleRemember(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.session.setRemember(on);
    this.toast.show(on ? 'Edit phrase stored in this browser' : 'Edit phrase forgotten');
  }

  protected logout(): void {
    this.session.logout();
    void this.router.navigate(['/']);
  }

  protected async deleteProfile(): Promise<void> {
    const sure = confirm(
      'Delete this profile from the server forever? Nobody — including us — can bring it back.',
    );
    if (!sure) return;
    try {
      await this.session.deleteProfile();
      this.toast.show('Profile deleted');
      void this.router.navigate(['/']);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected async addConnection(
    event: Event,
    nameInput: HTMLInputElement,
    phraseInput: HTMLInputElement,
  ): Promise<void> {
    event.preventDefault();
    const phrase = extractViewPhrase(phraseInput.value);
    if (!phrase) {
      this.toast.show('That doesn’t look like a Menagerie view phrase or link.', 'error');
      return;
    }
    try {
      await this.session.addConnection(nameInput.value, phrase);
      nameInput.value = '';
      phraseInput.value = '';
      this.toast.show('Saved');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected async removeConnection(id: string): Promise<void> {
    try {
      await this.session.removeConnection(id);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  constructor() {
    // Recurring monthly counter submission, decoupled from any save.
    this.session.maybeSubmitMetrics();
  }

  protected async toggleMetrics(event: Event): Promise<void> {
    const on = (event.target as HTMLInputElement).checked;
    try {
      await this.session.setMetricsOptIn(on);
      this.toast.show(
        on ? 'Counted — thank you. You can opt out any time.' : 'Opted out — no further submissions.',
      );
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  /** A group's public name is its creature — the phrase head. */
  protected groupName(groupPhrase: string): string {
    return groupPhrase.split('-').slice(0, 3).join('-');
  }

  protected async createGroup(): Promise<void> {
    this.creatingGroup.set(true);
    try {
      this.newGroup.set(await this.session.createGroup());
      this.toast.show('Group hatched — save the admin phrase');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      this.creatingGroup.set(false);
    }
  }

  protected openGroup(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const phrase = extractGroupPhrase(input.value);
    if (!phrase) {
      this.toast.show('That doesn’t look like a Menagerie group link or phrase.', 'error');
      return;
    }
    input.value = '';
    void this.router.navigate(['/group', phrase]);
  }

  protected compareWith(theirPhrase: string): void {
    const mine = this.session.viewPhrase();
    if (mine) this.compare.addPhrase(mine);
    this.compare.addPhrase(theirPhrase);
    void this.router.navigate(['/compare']);
  }
}
