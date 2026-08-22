import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'moxy-stat-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stat-tile">
      <div class="stat-label">{{ label() }}</div>
      <div class="stat-value">{{ value() }}</div>
      @if (sub(); as s) { <div class="stat-sub">{{ s }}</div> }
    </div>
  `,
})
export class StatTileComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly sub = input<string | null>(null);
}
