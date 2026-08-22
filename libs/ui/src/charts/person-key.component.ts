import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { seriesVar } from './series';

/** Legend of people-in-comparison — always present for 2+ series. */
@Component({
  selector: 'moxy-person-key',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="person-key" role="list">
      @for (name of names(); track $index) {
        <span class="person-chip" role="listitem">
          <span class="person-dot" [style.background]="color($index)"></span>
          <span class="person-name">{{ name }}</span>
        </span>
      }
    </div>
  `,
})
export class PersonKeyComponent {
  readonly names = input.required<readonly string[]>();
  protected readonly color = seriesVar;
}
