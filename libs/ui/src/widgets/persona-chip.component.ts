import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Persona } from '@moxy/core';

/** The profile's pet identity: creature emoji + "adj-adj-animal" name. */
@Component({
  selector: 'moxy-persona-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="persona-chip" [style.--persona-color]="persona().color">
      <span class="persona-emoji" aria-hidden="true">{{ persona().emoji }}</span>
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
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--persona-color) 45%, transparent);
      background: color-mix(in srgb, var(--persona-color) 10%, transparent);
      font-size: 14px;
      font-weight: 650;
      color: var(--ink);
      white-space: nowrap;
    }
    .persona-emoji { font-size: 16px; }
  `,
})
export class PersonaChipComponent {
  readonly persona = input.required<Persona>();
}
