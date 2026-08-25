import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CreatureIconComponent } from '../widgets/creature-icon.component';
import { seriesVar } from './series';

/**
 * Legend of people-in-comparison — always present for 2+ series. Identity is
 * carried by the categorical series dot; an optional persona emoji rides
 * beside the name as decoration, never replacing the dot.
 */
@Component({
  selector: 'moxy-person-key',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CreatureIconComponent],
  template: `
    <div class="person-key" role="list">
      @for (name of names(); track $index) {
        <span class="person-chip" role="listitem">
          <span class="person-dot" [style.background]="color($index)"></span>
          @if (emojis()?.[$index]; as emoji) {
            <moxy-creature-icon [emoji]="emoji" [size]="14" aria-hidden="true" />
          }
          <span class="person-name">{{ name }}</span>
        </span>
      }
    </div>
  `,
})
export class PersonKeyComponent {
  readonly names = input.required<readonly string[]>();
  readonly emojis = input<readonly (string | null)[] | null>(null);
  protected readonly color = seriesVar;
}
