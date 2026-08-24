import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Persona } from '@moxy/core';
import { CreatureIconComponent } from './creature-icon.component';

/** The profile's pet identity: pixel creature + "adj-adj-animal" name. */
@Component({
  selector: 'moxy-persona-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CreatureIconComponent],
  template: `
    <span class="persona-chip" [style.--persona-color]="persona().color">
      <moxy-creature-icon [emoji]="persona().emoji" [size]="16" />
      <span class="persona-name">{{ persona().name }}</span>
    </span>
  `,
  styles: `
    :host { display: inline-flex; }
    .persona-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 12px 3px 8px;
      border-radius: var(--radius-pill);
      border: 1px solid color-mix(in srgb, var(--persona-color) 45%, transparent);
      background: color-mix(in srgb, var(--persona-color) 10%, transparent);
      font-size: 14px;
      font-weight: 650;
      color: var(--ink);
      white-space: nowrap;
    }
  `,
})
export class PersonaChipComponent {
  readonly persona = input.required<Persona>();
}
