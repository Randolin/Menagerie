import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { bannerStyleFor, tailPlaceOf, type Persona } from '@moxy/core';
import { LocationBannerComponent } from './location-banner.component';
import { CreatureAvatarComponent } from './creature-avatar.component';
import { habitatClass } from './persona-decor';

/**
 * The card that introduces a subject the viewer holds a phrase for: location
 * banner, title, persona chip, habitat motif — then whatever the page puts
 * in the body (extra header row items project via [subject-head]).
 *
 * The banner renders only here — never on member rows or compare panels:
 * those carry a random pseudonym and a null persona, and bannerStyleFor
 * returns null for them, but the structural rule is what actually keeps the
 * tail off screens whose viewer has no phrase.
 */
@Component({
  selector: 'moxy-subject-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LocationBannerComponent, CreatureAvatarComponent],
  host: { '[class]': 'hostClass()' },
  template: `
    <moxy-location-banner [banner]="banner()" />
    <h2 class="profile-head">
      @if (persona(); as persona) {
        <moxy-creature-avatar [persona]="persona" [size]="44" />
        <span class="persona-name">{{ persona.name }}</span>
      } @else {
        {{ title() }}
      }
      <ng-content select="[subject-head]" />
    </h2>
    <ng-content />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class SubjectCardComponent {
  readonly persona = input.required<Persona | null | undefined>();
  /** The subject's view/group phrase — the banner derives its landform from its tail. */
  readonly phrase = input.required<string | null | undefined>();
  readonly title = input.required<string>();

  protected readonly banner = computed(() =>
    bannerStyleFor(this.persona(), tailPlaceOf(this.phrase())),
  );
  protected readonly hostClass = computed(
    () => `card habitat-accent ${habitatClass(this.persona())}`,
  );
}
