import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  type Type,
} from '@angular/core';
import type { CompareModel } from './compare-model';
import {
  COMPARE_PANELS,
  type ComparePanelComponent,
  type ComparePanelDescriptor,
} from './compare-panels.token';

interface ResolvedPanel {
  readonly descriptor: ComparePanelDescriptor;
  readonly component: Type<ComparePanelComponent>;
}

/**
 * The registered panels, resolved once and rendered in order against one
 * model. Owning this here means the demo page shows exactly what the real
 * compare page shows: a panel registered in app.config.ts appears in both, or
 * neither, and there is no second list to keep in step.
 */
@Component({
  selector: 'moxy-compare-panels',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    @for (panel of visiblePanels(); track panel.descriptor.id) {
      <ng-container *ngComponentOutlet="panel.component; inputs: { model: model() }" />
    }
  `,
})
export class ComparePanelsComponent {
  readonly model = input.required<CompareModel>();

  private readonly resolved = signal<readonly ResolvedPanel[]>([]);

  protected readonly visiblePanels = computed(() => {
    const model = this.model();
    return this.resolved().filter((p) => !p.descriptor.visible || p.descriptor.visible(model));
  });

  constructor() {
    const descriptors = [...(inject(COMPARE_PANELS, { optional: true }) ?? [])].sort(
      (a, b) => a.order - b.order,
    );
    void Promise.all(
      descriptors.map(async (descriptor) => ({
        descriptor,
        component: await descriptor.loadComponent(),
      })),
    ).then((panels) => this.resolved.set(panels));
  }
}
