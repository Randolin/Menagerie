import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ANIMALS } from '@moxy/core';
import { creaturePixelSvg } from '../creatures/pixel-art';

/**
 * A creature's face: the first-party pixel sprite when one exists for the
 * animal behind the given emoji, the emoji itself otherwise. Call sites
 * everywhere already hold an emoji (including ones carried over the wire in
 * boops), so the emoji IS the API and unknown glyphs — 🥚, group pseudonym
 * marks — degrade gracefully to plain text.
 *
 * The SVG comes from our own sprite table, never user data, so bypassing
 * sanitization is sound (same reasoning as the QR component).
 */
@Component({
  selector: 'moxy-creature-icon',
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
    :host { display: inline-flex; }
    .creature-icon { display: inline-flex; align-items: center; line-height: 1; }
  `,
})
export class CreatureIconComponent {
  readonly emoji = input.required<string>();
  readonly size = input(16);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly svg = computed<SafeHtml | null>(() => {
    const animal = ANIMALS.find((a) => a.emoji === this.emoji());
    const svg = animal ? creaturePixelSvg(animal.name, this.size()) : null;
    return svg ? this.sanitizer.bypassSecurityTrustHtml(svg) : null;
  });
}
