import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CompareModel } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';
import { buildNarrative } from '../narrative';

/** The comparison in sentences — and the only part of it a screen reader can read. */
@Component({
  selector: 'moxy-narrative-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <h2 i18n>In words</h2>
      <p i18n class="sub">
        The same comparison as the charts below, written out — what the numbers are actually saying
        about the answers you each gave.
      </p>
      @for (note of notes(); track note.text) {
        @if (note.tone === 'attention') {
          <p class="notice-warn notice">{{ note.text }}</p>
        } @else {
          <p>{{ note.text }}</p>
        }
      }
    </div>
  `,
})
export class NarrativePanel implements ComparePanelComponent {
  readonly model = input.required<CompareModel>();

  protected readonly notes = computed(() => buildNarrative(this.model()));
}
