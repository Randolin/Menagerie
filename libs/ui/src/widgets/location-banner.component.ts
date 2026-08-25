import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { BannerStyle } from '@moxy/core';

/**
 * The page's sense of place: a soft band of landform colour above the card's
 * heading. Renders nothing when the style is null, which is how it stays off
 * every surface whose viewer doesn't hold the phrase (see bannerStyleFor).
 *
 * aria-hidden: this is decoration. The accessible identity of a profile is the
 * persona chip and the heading beside it; the banner adds atmosphere, and its
 * label is deliberately vague ("somewhere green and sheltered"), so announcing
 * it would add noise without adding information.
 */
@Component({
  selector: 'moxy-location-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (banner(); as s) {
      <div class="location-banner {{ s.familyClass }} {{ s.variantClass }} {{ s.timeClass }}" aria-hidden="true">
        <span class="location-motifs">
          @for (i of motifs(); track i) {
            <span class="location-motif">{{ s.motif }}</span>
          }
        </span>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
  `,
})
export class LocationBannerComponent {
  /**
   * NOT named `style`: `[style]` is Angular's native style binding, so an
   * input by that name is silently shadowed and never receives a value.
   */
  readonly banner = input.required<BannerStyle | null>();

  /** density 0..3 → 1..4 motifs; every banner keeps at least one. */
  protected readonly motifs = computed(() => {
    const s = this.banner();
    // Array.from, not `new Array(n)`: a sparse array has length but no
    // elements, which some iteration paths skip entirely.
    return s ? Array.from({ length: (s.density % 4) + 1 }, (_, i) => i) : [];
  });
}
