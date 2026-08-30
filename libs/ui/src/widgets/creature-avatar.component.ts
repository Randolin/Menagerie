import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { personaHabitat, type Persona } from '@mng/core';
import { CreatureIconComponent } from './creature-icon.component';

/**
 * The creature as an avatar: a textured backdrop, a thick ring, and the
 * animal's art floating above both.
 *
 * This exists because the animal alone is a weak identity at roster scale.
 * With 108 animals, two people in a group of ten share one about a third of
 * the time (birthday problem, not the 1-in-108 it feels like), and the icon
 * threw away everything that already told them apart — a fixed palette per
 * animal renders two otters byte-identical. The head words carry a colour, a
 * second colour and a habitat that nothing was drawing.
 *
 * So the layers split by what they encode:
 *   backdrop — colour2 into colour, plus a habitat-shaped texture
 *   ring     — the persona colour, thick enough to read at chip size
 *   icon     — the animal, untouched
 *
 * Untouched is the point. Artwork gets a transparent background and is never
 * recoloured: species colour is species signal (a panda is not a hue), and
 * separating two otters is the backdrop's job, not the otter's. Everything
 * here derives from HEAD words only — the tail must never reach a pixel.
 */
@Component({
  selector: 'mng-creature-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CreatureIconComponent],
  template: `
    <span
      class="creature-avatar"
      [class]="habitatClass()"
      [style.--avatar-size.px]="size()"
      [style.--avatar-color]="persona()?.color || 'var(--accent)'"
      [style.--avatar-color2]="persona()?.color2 || 'var(--accent)'"
      [attr.title]="persona()?.name"
    >
      <span class="creature-avatar-face">
        <mng-creature-icon
          [emoji]="persona()?.emoji ?? fallbackEmoji()"
          [animal]="persona()?.words?.[2] ?? null"
          [size]="iconSize()"
        />
      </span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .creature-avatar {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--avatar-size);
      height: var(--avatar-size);
      border-radius: 50%;
      /* The ring is a border rather than an outline so it participates in the
         circle and scales with the avatar. */
      border: calc(var(--avatar-size) / 12) solid var(--avatar-color);
      background: radial-gradient(
        circle at 30% 25%,
        color-mix(in srgb, var(--avatar-color2) 70%, white) 0%,
        var(--avatar-color2) 55%,
        color-mix(in srgb, var(--avatar-color) 60%, var(--avatar-color2)) 100%
      );
      box-sizing: border-box;
      overflow: hidden;
    }
    /* Habitat texture, drawn in the backdrop only — the icon sits above it.
       Pure CSS gradients: no runtime canvas, no extra request, and it scales
       to any avatar size. */
    .creature-avatar::before {
      content: '';
      position: absolute;
      inset: 0;
      opacity: 0.35;
      background-size: calc(var(--avatar-size) / 3) calc(var(--avatar-size) / 3);
    }
    .habitat-water::before {
      background-image: repeating-linear-gradient(
        -20deg,
        rgba(255, 255, 255, 0.55) 0 2px,
        transparent 2px 7px
      );
    }
    .habitat-forest::before {
      background-image: repeating-linear-gradient(
        60deg,
        rgba(255, 255, 255, 0.4) 0 2px,
        transparent 2px 8px
      );
    }
    .habitat-sky::before {
      background-image: radial-gradient(circle, rgba(255, 255, 255, 0.6) 18%, transparent 20%);
    }
    .habitat-meadow::before {
      background-image: radial-gradient(
        circle at 70% 30%,
        rgba(255, 255, 255, 0.5) 12%,
        transparent 14%
      );
    }
    .habitat-mythic::before {
      background-image: conic-gradient(
        from 0deg,
        rgba(255, 255, 255, 0.5) 0deg 18deg,
        transparent 18deg 90deg
      );
    }
    .creature-avatar-face {
      position: relative;
      display: inline-flex;
      line-height: 1;
      /* Keeps a light sprite legible against a light backdrop without
         recolouring a single pixel of it. */
      filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
    }
  `,
})
export class CreatureAvatarComponent {
  readonly persona = input<Persona | null>(null);
  readonly size = input(48);
  /** Shown when there is no persona yet — an unhatched egg, not an animal. */
  readonly fallbackEmoji = input('🥚');

  protected readonly iconSize = computed(() => Math.round(this.size() * 0.62));
  protected readonly habitatClass = computed(() => {
    const habitat = personaHabitat(this.persona());
    return habitat ? `habitat-${habitat}` : '';
  });
}
