import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ANIMALS } from '@mng/core';
import { creaturePixelSvg } from '../creatures/pixel-art';

/**
 * A creature's face: the first-party art for the animal when we have it, the
 * emoji otherwise.
 *
 * The ANIMAL NAME is the real key. Emoji was the original one — every call
 * site had an emoji to hand, including boops that carry it over the wire —
 * but keying art off emoji caps ANIMALS at however many distinct
 * single-codepoint emoji exist, which the list has already exhausted. Passing
 * `animal` skips the reverse lookup, so a new animal needs artwork and a
 * name, not a spare glyph.
 *
 * `emoji` stays required: it is still what arrives from the wire, still the
 * fallback when an animal has no art yet, and still the only thing behind a
 * non-animal glyph (🥚, group pseudonym marks) — those degrade to plain text.
 *
 * The SVG comes from our own sprite table, never user data, so bypassing
 * sanitization is sound (same reasoning as the QR component).
 */
@Component({
  selector: 'mng-creature-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svg(); as s) {
      <span class="creature-icon" [innerHTML]="s"></span>
    } @else {
      <span class="creature-icon" [style.font-size.px]="size()" aria-hidden="true">{{
        emoji()
      }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .creature-icon {
      display: inline-flex;
      align-items: center;
      line-height: 1;
    }
  `,
})
export class CreatureIconComponent {
  readonly emoji = input.required<string>();
  /** Preferred over the emoji lookup when the caller knows the animal. */
  readonly animal = input<string | null>(null);
  readonly size = input(16);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly svg = computed<SafeHtml | null>(() => {
    const name = this.animal() ?? ANIMALS.find((a) => a.emoji === this.emoji())?.name ?? null;
    const svg = name ? creaturePixelSvg(name, this.size()) : null;
    return svg ? this.sanitizer.bypassSecurityTrustHtml(svg) : null;
  });
}
