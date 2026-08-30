import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { interestLabel, itemLabel, type GridRow } from '@mng/core';
import { seriesVar } from './series';

interface MatrixRow {
  readonly label: string;
  readonly levels: readonly (number | null)[];
  readonly badge: 'mutual' | 'possible' | null;
}

/**
 * Interest items × people. Magnitude is the single-hue ordinal ramp
 * (--ramp-1..3); level 0 stays a neutral outline so "not for me" reads as
 * absence of heat. Every cell also carries its text label — color never
 * works alone.
 */
@Component({
  selector: 'mng-interest-matrix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="matrix-wrap">
      <table class="matrix">
        <thead>
          <tr>
            <th class="matrix-item-head" scope="col"></th>
            @for (name of names(); track $index) {
              <th scope="col">
                <span class="person-dot" [style.background]="color($index)"></span>
                {{ ' ' + name }}
              </th>
            }
            @if (names().length >= 2) {
              <th scope="col" class="matrix-mutual-head"></th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of matrixRows(); track row.label) {
            <tr [class.row-mutual]="row.badge === 'mutual'">
              <th scope="row" class="matrix-item">{{ row.label }}</th>
              @for (lvl of row.levels; track $index) {
                @if (lvl === null) {
                  <td class="cell cell-empty" [title]="names()[$index] + ': not answered'">—</td>
                } @else {
                  <td i18n class="cell" [title]="names()[$index] + ': ' + levelLabel(lvl)">
                    <span
                      class="interest-pip lvl-{{ lvl }}"
                      [style.background]="lvl > 0 ? 'var(--ramp-' + lvl + ')' : ''"
                    ></span>
                    <span class="cell-label">{{ levelLabel(lvl) }}</span>
                  </td>
                }
              }
              @if (names().length >= 2) {
                <td class="matrix-mutual">
                  @if (row.badge === 'mutual') {
                    <span i18n class="badge badge-mutual">mutual ✦</span>
                  } @else if (row.badge === 'possible') {
                    <span i18n class="badge badge-open">possible</span>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class InterestMatrixComponent {
  readonly rows = input.required<readonly GridRow[]>();
  readonly names = input.required<readonly string[]>();
  protected readonly color = seriesVar;
  protected readonly levelLabel = interestLabel;

  protected readonly matrixRows = computed<MatrixRow[]>(() =>
    this.rows().map((row) => {
      const levels = row.answers.map((v) => (typeof v === 'number' ? v : null));
      const answered = levels.filter((v): v is number => v !== null);
      let badge: MatrixRow['badge'] = null;
      if (this.names().length >= 2 && answered.length >= 2) {
        const min = Math.min(...answered);
        if (min >= 2) badge = 'mutual';
        else if (min >= 1) badge = 'possible';
      }
      const label = itemLabel(row.item);
      return { label, levels, badge };
    }),
  );
}
