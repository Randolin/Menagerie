import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { GC_EMPTY_HUMAN, GC_IDLE_HUMAN, SECTIONS, coreItems } from '@moxy/core';
import { QrCodeComponent, RingComponent, SubjectCardComponent, ToastService } from '@moxy/ui';
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
    CategoryCardComponent,
    AddCategoryComponent,
    SaveBarComponent,
    SubjectCardComponent,
    QrCodeComponent,
    RingComponent,
  ],
  template: `
    @if (!noticeDismissed()) {
      <div class="card card-danger" role="alert" aria-labelledby="edit-phrase-heading">
        <h2 id="edit-phrase-heading">⚠️ Save your edit phrase before you do anything else</h2>
        <p class="sub">
          This phrase is the <strong>only</strong> way to edit this profile. It is shown here once.
          Dismiss this notice and it lives nowhere but where you put it — no account, no email, no
          reset. Lose it and this profile can never be edited again.
        </p>
        <div class="passphrase-box">{{ session.editPhrase() }}</div>
        <p class="fine">
          Housekeeping: profiles with no saved answers are deleted after
          {{ gcEmpty }}; profiles untouched and unviewed for {{ gcIdle }} are deleted too. Saving
          anything, or anyone viewing you, keeps yours alive.
        </p>
        <div class="btn-row">
          <button
            class="btn btn-primary"
            (click)="copyEditPhrase()"
            [attr.aria-label]="copied() ? 'Edit phrase copied' : 'Copy edit phrase'"
          >
            {{ copied() ? '✓ Copied' : '📋 Copy edit phrase' }}
          </button>
        </div>
        <label class="ack-row">
          <input type="checkbox" [checked]="acknowledged()" (change)="toggleAck($event)" />
          <span>
            I have saved my edit phrase somewhere I can get back to — a password manager, or written
            down.
          </span>
        </label>
        <div class="btn-row">
          <button class="btn btn-primary" [disabled]="!acknowledged()" (click)="dismissNotice()">
            I’ve saved it — hide this
          </button>
          @if (!acknowledged()) {
            <span class="fine">Tick the box above to dismiss.</span>
          }
        </div>
      </div>
    }

    <moxy-subject-card
      [persona]="session.persona()"
      [phrase]="session.viewPhrase()"
      title="My profile"
    >
      <button subject-head class="btn btn-ghost btn-small" (click)="regenerate()">
        🎲 New creature
      </button>
      <p class="sub">
        Share the phrase, the link, or the QR code — all three carry the same view-only credential.
        Your creature is its first three words; anyone who can see your profile can recognize it. A
        new creature is a whole new phrase: every previously shared link and QR stops working.
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
            {{
              session.populated()
                ? 'Viewers see only the sections you’ve saved.'
                : 'Nothing is filled in yet — viewers would see an empty profile.'
            }}
          </p>
        </div>
        @if (session.viewUrl(); as url) {
          <moxy-qr-code [text]="url" [persona]="session.persona()" />
        }
      </div>
    </moxy-subject-card>

    <div class="profile-head">
      <h2>My answers</h2>
      <span class="fine core-marker" [class.core-done]="coreDone()">
        <moxy-ring [fraction]="coreFraction()" [size]="20" label="core completion" />
        {{
          coreDone()
            ? 'Core complete — comparisons have their footing'
            : 'Core ' +
              coreAnswered() +
              ' of ' +
              coreTotal +
              ' — comparisons work best from a full core'
        }}
      </span>
    </div>

    @for (s of addedSections(); track s.id) {
      <moxy-category-card [section]="s" />
    }

    <moxy-add-category />

    <moxy-save-bar />

    @if (!addedSections().length) {
      <p class="fine" style="margin:10px 4px">
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
