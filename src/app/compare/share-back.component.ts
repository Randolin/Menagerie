import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { BoopReachability } from '@moxy/core';
import { BoopComposerComponent } from '../boop/boop-composer.component';

/**
 * The last unlinked step in the loop, offered where it finally makes sense.
 *
 * Someone scans a QR, views a stranger's profile, hatches, answers, and
 * compares. They now know everything; the person who shared the phrase still
 * has nothing — no phrase, no creature, nothing their menagerie can refresh.
 * The mechanism to fix that already exists and is already the app's own
 * designed escalation: a boop carrying a view phrase is exactly "here is my
 * creature back". What was missing was the offer, at the one moment the
 * product has just proved itself to the person being asked.
 *
 * The copy is conditional on purpose. This app cannot know whether the other
 * person already holds your phrase — they may have been handed it in the same
 * conversation — so it must not diagnose their state, and it must never imply
 * they are waiting or watching. It states how comparisons work and offers the
 * means. Attaching the phrase stays a tick inside the composer: the panel
 * proposes, the person disposes, and the de-anonymization ladder is untouched.
 */
@Component({
  selector: 'moxy-share-back',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoopComposerComponent],
  template: `
    <div class="card no-print">
      <h2 i18n>Send your creature back</h2>
      <p i18n class="sub">
        A comparison only exists for whoever holds both phrases. You have {{ name() }}’s; if they
        don’t have yours, a boop can carry it — tick <strong>Include my view phrase</strong> below
        and they’ll see your creature and can compare from their side.
      </p>
      <moxy-boop-composer [target]="target()" [label]="name()" [emoji]="emoji()" />
    </div>
  `,
})
export class ShareBackComponent {
  readonly target = input.required<BoopReachability>();
  readonly name = input.required<string>();
  readonly emoji = input('🥚');
}
