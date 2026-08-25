import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { getSection, type ScaleItem } from '@moxy/core';
import { PersonKeyComponent, RadarComponent, type RadarSeries } from '@moxy/ui';
import type { CompareModel } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

/**
 * The fingerprint: everyone's values sliders overlaid as one shape each.
 * Axes are the values scales every loaded profile answered (at least three,
 * or the panel stays hidden); each axis points toward its right-hand anchor.
 */
@Component({
  selector: 'moxy-fingerprint-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PersonKeyComponent, RadarComponent],
  template: `
    <div class="card">
      <h2>Values fingerprint</h2>
      <p class="sub">
        Each shape is one profile's values, drawn over the same axes — overlap is alignment you can
        see. An axis points toward the trait it names.
      </p>
      <moxy-person-key [names]="model().names" [emojis]="personaEmojis()" />
      <moxy-radar [axes]="axes()" [series]="series()" />
    </div>
  `,
})
export class FingerprintPanel implements ComparePanelComponent {
  readonly model = input.required<CompareModel>();

  protected readonly personaEmojis = computed(() => this.model().emojis);

  /** Values scales answered by every loaded profile. */
  private readonly sharedScales = computed<ScaleItem[]>(() => {
    const payloads = this.model().payloads;
    const values = getSection('values');
    if (!values || payloads.length < 2) return [];
    return values.items.filter(
      (item): item is ScaleItem =>
        item.type === 'scale' && payloads.every((p) => typeof p.a[item.id] === 'number'),
    );
  });

  protected readonly axes = computed(() => this.sharedScales().map((s) => s.right));

  protected readonly series = computed<RadarSeries[]>(() =>
    this.model().payloads.map((p, i) => ({
      name: this.model().names[i],
      values: this.sharedScales().map((s) => (p.a[s.id] as number) / 6),
    })),
  );
}
