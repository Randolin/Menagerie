import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { GC_EMPTY_HUMAN, GC_IDLE_HUMAN, SECTIONS, coreItems } from '@moxy/core';
import {
  IconComponent,
  QrCodeComponent,
  RingComponent,
  SubjectCardComponent,
  ToastService,
  shareText,
} from '@moxy/ui';
import { RouterLink } from '@angular/router';
import { CategoryCardComponent } from '../profile/category-card.component';
import { AddCategoryComponent } from '../profile/add-category.component';
import { SaveBarComponent } from '../profile/save-bar.component';
import { APP_STORAGE } from '../stores/storage.token';
import { DraftStore } from '../stores/draft.store';
import { ProfileSessionStore } from '../stores/profile-session.store';

@Component({
  selector: 'moxy-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CategoryCardComponent,
    AddCategoryComponent,
    SaveBarComponent,
    SubjectCardComponent,
    QrCodeComponent,
    IconComponent,
    RingComponent,
  ],
  template: `
    @if (!noticeDismissed()) {
      <div class="card card-danger" role="alert" aria-labelledby="edit-phrase-heading">
        <h2 i18n id="edit-phrase-heading">⚠️ Save your edit phrase</h2>
        <p i18n class="sub">
          The only way to edit this profile. Shown once — no account, no reset. Lose it and this
          profile can never be edited again.
        </p>
        <div class="phrase-row">
          <div class="passphrase-box">{{ session.editPhrase() }}</div>
          <button
            class="btn btn-icon"
            [class.is-done]="copied()"
            (click)="copyEditPhrase()"
            [attr.aria-label]="copied() ? 'Edit phrase copied' : 'Copy edit phrase'"
            [title]="copied() ? 'Copied' : 'Copy edit phrase'"
          >
            <moxy-icon [name]="copied() ? 'check' : 'copy'" />
          </button>
        </div>
        <label class="ack-row">
          <input type="checkbox" [checked]="acknowledged()" (change)="toggleAck($event)" />
          <span i18n>I’ve saved it somewhere I can get back to.</span>
        </label>
        <div class="btn-row">
          <button
            i18n
            class="btn btn-primary"
            [disabled]="!acknowledged()"
            (click)="dismissNotice()"
          >
            I’ve saved it
          </button>
          <!-- "Somewhere I can get back to" is easier to tick than to do.
               This is the somewhere. -->
          <a i18n class="btn" routerLink="/backup">🖨️ Print a backup card</a>
          <span i18n class="fine">
            Profiles with no saved answers are deleted after {{ gcEmpty }}; untouched and unviewed
            for {{ gcIdle }}, also deleted.
          </span>
        </div>
      </div>
    }

    <moxy-subject-card
      [persona]="session.persona()"
      [phrase]="session.viewPhrase()"
      i18n-title
      title="My profile"
    >
      <button i18n subject-head class="btn btn-ghost btn-small" (click)="regenerate()">
        New creature
      </button>
      <p i18n class="sub">
        Share the phrase, the link, or the QR code — all three carry the same view-only credential.
        Your creature is its first three words; anyone who can see your profile can recognize it. A
        new creature is a whole new phrase: every previously shared link and QR stops working.
      </p>
      <div class="share-grid">
        <div>
          <div class="code-box">{{ session.viewPhrase() }}</div>
          <div class="btn-row" style="margin-top:12px">
            <!-- Only where there is a share sheet to open. Copy stays either
                 way: sharing is an upgrade on it, never a replacement. -->
            @if (canShare) {
              <button
                class="btn btn-icon"
                (click)="shareView()"
                i18n-aria-label
                aria-label="Share view link"
                i18n-title
                title="Share view link"
              >
                <moxy-icon name="share" />
              </button>
            }
            <button
              class="btn btn-icon"
              (click)="copy(session.viewUrl()!, 'View link copied')"
              i18n-aria-label
              aria-label="Copy view link"
              i18n-title
              title="Copy view link"
            >
              <moxy-icon name="link" />
            </button>
            <button
              class="btn btn-icon"
              (click)="copy(session.viewPhrase()!, 'View phrase copied')"
              i18n-aria-label
              aria-label="Copy the phrase on its own"
              i18n-title
              title="Copy the phrase on its own"
            >
              <moxy-icon name="copy" />
            </button>
          </div>
          <p class="fine" style="margin-top:10px">
            @if (session.populated()) {
              <span i18n>Viewers see only the sections you’ve saved.</span>
            } @else {
              <span i18n>Nothing is filled in yet — viewers would see an empty profile.</span>
            }
          </p>
        </div>
        @if (session.viewUrl(); as url) {
          <moxy-qr-code
            [text]="url"
            [persona]="session.persona()"
            [shareAs]="session.persona()?.name ?? null"
          />
        }
      </div>
    </moxy-subject-card>

    @if (showMilestone()) {
      <div class="card" role="status">
        <h2 i18n>🎉 Your core set is done</h2>
        <p i18n class="sub">
          Every question a comparison leans on is answered, so yours is worth sharing now. The other
          half is someone else's: a comparison needs two profiles, and nothing happens until one of
          you sends a phrase.
        </p>
        <div class="btn-row">
          <button
            i18n
            class="btn btn-primary"
            (click)="copy(session.viewUrl()!, 'View link copied')"
          >
            Copy my view link
          </button>
          <a i18n class="btn" routerLink="/menagerie">Keep someone's phrase</a>
          <button i18n class="btn btn-ghost" (click)="dismissMilestone()">Dismiss</button>
        </div>
      </div>
    }

    <div class="profile-head">
      <h2 i18n>My answers</h2>
      <span class="fine core-marker" [class.core-done]="coreDone()">
        <moxy-ring [fraction]="coreFraction()" [size]="20" label="core completion" />
        @if (coreDone()) {
          <span i18n>Core complete — comparisons have their footing</span>
        } @else {
          <span i18n
            >Core {{ coreAnswered() }} of {{ coreTotal }} — about five minutes in all, and
            comparisons work best from a full one</span
          >
        }
      </span>
    </div>

    @for (s of addedSections(); track s.id) {
      <moxy-category-card [section]="s" />
    }

    <moxy-add-category />

    <moxy-save-bar />

    @if (!addedSections().length) {
      <p i18n class="fine" style="margin:10px 4px">
        Nothing here yet. Add a category above — every question is optional, and only what you
        answer is ever shown.
      </p>
    }
  `,
  styles: `
    .core-marker {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .core-done {
      color: var(--accent);
    }
  `,
})
export class DashboardComponent {
  protected readonly gcEmpty = GC_EMPTY_HUMAN;
  protected readonly gcIdle = GC_IDLE_HUMAN;

  protected readonly session = inject(ProfileSessionStore);
  protected readonly draft = inject(DraftStore);
  private readonly storage = inject(APP_STORAGE);
  private readonly toast = inject(ToastService);

  /** Only the categories on the profile — the rest live behind “Add”. */
  protected readonly addedSections = computed(() =>
    SECTIONS.filter((sec) => this.draft.isAdded(sec)),
  );
  private readonly coreIds = coreItems().map(({ item }) => item.id);
  protected readonly coreTotal = this.coreIds.length;
  protected readonly coreAnswered = computed(() => this.draft.answeredAmong(this.coreIds));
  protected readonly coreFraction = computed(() =>
    this.coreTotal === 0 ? 0 : this.coreAnswered() / this.coreTotal,
  );
  protected readonly coreDone = computed(() => this.coreAnswered() === this.coreTotal);

  /**
   * The notice is the one dismissal in the app that destroys something: after
   * it, the edit phrase exists only wherever the person put it. So dismissal
   * is gated on an explicit acknowledgement rather than a stray click, and
   * `copied` reports whether the clipboard write actually landed — it silently
   * fails often enough (permissions, http, mobile browsers) that "I clicked
   * copy" is not evidence the phrase was saved.
   */
  protected readonly copied = signal(false);
  protected readonly acknowledged = signal(false);

  protected async copyEditPhrase(): Promise<void> {
    const phrase = this.session.editPhrase();
    if (!phrase) return;
    this.copied.set(await this.toast.copy(phrase, 'Copied — store it somewhere safe'));
  }

  protected toggleAck(event: Event): void {
    this.acknowledged.set((event.target as HTMLInputElement).checked);
  }

  /**
   * Closing the tab is the other way to lose the phrase, and no in-page gate
   * catches it. Browsers show their own generic wording; the returned string
   * is legacy API, not copy we control.
   */
  @HostListener('window:beforeunload', ['$event'])
  protected warnOnLeave(event: BeforeUnloadEvent): void {
    if (!this.noticeDismissed() || this.session.dirty()) event.preventDefault();
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

  /**
   * Finishing the core tier is the moment a profile first becomes worth
   * sharing, and it used to pass as a label quietly changing wording. This is
   * the one time it says so — and says the part people miss, which is that a
   * finished profile on its own still compares against nothing.
   *
   * Held back until the edit-phrase notice is gone: two loud cards competing
   * on the same screen would cost the more important one its attention.
   * Dismissal is per creature and survives reloads, like the notice above.
   */
  protected readonly showMilestone = computed(
    () => this.coreDone() && this.noticeDismissed() && !this.milestoneDismissed(),
  );

  private readonly milestoneSeen = signal(0);
  private readonly milestoneDismissed = computed(() => {
    this.milestoneSeen();
    const persona = this.session.persona();
    if (!persona) return true;
    try {
      return this.storage.getItem(this.milestoneKey(persona.name)) === '1';
    } catch {
      return true;
    }
  });

  protected dismissMilestone(): void {
    const persona = this.session.persona();
    if (!persona) return;
    try {
      this.storage.setItem(this.milestoneKey(persona.name), '1');
    } catch {
      /* fine */
    }
    this.milestoneSeen.update((n) => n + 1);
  }

  private milestoneKey(personaName: string): string {
    return `moxy.core.milestone.${personaName}`;
  }

  /** Read once: it decides whether a button exists, and cannot change. */
  protected readonly canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  /**
   * The share sheet is how a phrase actually reaches someone on a phone —
   * into a message, not onto a clipboard they then have to paste somewhere.
   * Falls back to copying if the sheet is missing or fails.
   */
  protected async shareView(): Promise<void> {
    const url = this.session.viewUrl();
    const persona = this.session.persona();
    if (!url) return;
    const outcome = await shareText({
      title: 'My Menagerie profile',
      text: persona ? `I'm ${persona.name} on Menagerie — compare with me?` : undefined,
      url,
    });
    if (outcome === 'unavailable') await this.copy(url, 'View link copied');
  }

  protected async copy(text: string, okMessage: string): Promise<void> {
    await this.toast.copy(text, okMessage);
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
      this.toast.error(err);
    }
  }
}
