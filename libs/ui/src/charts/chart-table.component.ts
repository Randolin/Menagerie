import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The numbers behind a chart, as a real table.
 *
 * Every chart in this app carries `role="img"` and a one-line summary, which
 * tells a screen-reader user that a shape exists and roughly how big it is —
 * not what it says. This is the rest: the same values, in a table anyone can
 * read cell by cell, folded away behind a disclosure so it costs sighted
 * readers nothing.
 *
 * Not only for screen readers. A table is also what someone reaches for when
 * they distrust a shape, or want to quote one row to the person they compared
 * with, or is looking at a strip on a phone where the dot labels collide.
 */
@Component({
  selector: 'moxy-chart-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="chart-table">
      <summary>{{ summary() }}</summary>
      <div class="matrix-wrap">
        <table class="matrix">
          <caption class="sr-only">
            {{
              caption()
            }}
          </caption>
          <thead>
            <tr>
              @for (column of columns(); track column) {
                <th scope="col">{{ column }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row[0]) {
              <tr>
                @for (cell of row; track $index; let i = $index) {
                  @if (i === 0) {
                    <th scope="row">{{ cell }}</th>
                  } @else {
                    <td>{{ cell }}</td>
                  }
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    </details>
  `,
})
export class ChartTableComponent {
  /** The disclosure's own label — what opening it gets you. */
  readonly summary = input('Read this as a table');
  /** Describes the table to a screen reader; never shown. */
  readonly caption = input.required<string>();
  readonly columns = input.required<readonly string[]>();
  /** Each row's first cell is its header — the thing the row is about. */
  readonly rows = input.required<readonly (readonly (string | number)[])[]>();
}
