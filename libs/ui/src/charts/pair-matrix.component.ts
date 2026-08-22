import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { seriesVar } from './series';

/** Pairwise overall-affinity table for 3+ people. Scores are 0..1 or null. */
@Component({
  selector: 'moxy-pair-matrix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="matrix-wrap">
      <table class="matrix pair-matrix">
        <thead>
          <tr>
            <th></th>
            @for (name of names(); track $index) {
              <th scope="col">
                <span class="person-dot" [style.background]="color($index)"></span> {{ name }}
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (rowName of names(); track $index; let i = $index) {
            <tr>
              <th scope="row">
                <span class="person-dot" [style.background]="color(i)"></span> {{ rowName }}
              </th>
              @for (colName of names(); track $index; let j = $index) {
                @if (i === j) {
                  <td class="cell cell-self">·</td>
                } @else if (scores()[i][j] === null) {
                  <td class="cell">—</td>
                } @else {
                  <td class="cell">{{ Math.round(scores()[i][j]! * 100) }}%</td>
                }
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class PairMatrixComponent {
  readonly names = input.required<readonly string[]>();
  readonly scores = input.required<readonly (readonly (number | null)[])[]>();
  protected readonly color = seriesVar;
  protected readonly Math = Math;
}
