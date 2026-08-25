import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { bannerStyleFor, tailPlaceOf, type Persona } from '@moxy/core';
import { LocationBannerComponent } from './location-banner.component';
import { PersonaChipComponent } from './persona-chip.component';
import { habitatClass, habitatMotif } from './persona-decor';

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
  imports: [LocationBannerComponent, PersonaChipComponent],
  host: { '[class]': 'hostClass()' },
  template: `
    <moxy-location-banner [banner]="banner()" />
    <h2 class="profile-head">
      {{ title() }}
      @if (persona(); as persona) {
        <moxy-persona-chip [persona]="persona" />
      }
      @if (motif(); as motif) {
        <span class="habitat-motif" [title]="motif.title" aria-hidden="true">{{
          motif.glyph
        }}</span>
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
  protected readonly motif = computed(() => habitatMotif(this.persona()));
  protected readonly hostClass = computed(
    () => `card habitat-accent ${habitatClass(this.persona())}`,
  );
}
