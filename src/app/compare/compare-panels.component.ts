import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
 *
 * Two tiers, one fold. The lead panels answer the question someone came with;
 * the rest are the evidence, behind a single disclosure. One disclosure, not
 * one per panel — a page of collapsed rows is a filing cabinet, and nobody
 * opens a filing cabinet to find out how a date went.
 */
@Component({
  selector: 'mng-compare-panels',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    @for (panel of leadPanels(); track panel.descriptor.id) {
      <ng-container *ngComponentOutlet="panel.component; inputs: { model: model() }" />
    }
    @if (detailPanels().length) {
      <details class="detail-more" [open]="open()" (toggle)="sync($event)">
        <summary>
          <span i18n>See the detail</span>
          <span i18n class="fine">the same comparison, section by section</span>
        </summary>
        @for (panel of detailPanels(); track panel.descriptor.id) {
          <ng-container *ngComponentOutlet="panel.component; inputs: { model: model() }" />
        }
      </details>
    }
  `,
})
export class ComparePanelsComponent {
  readonly model = input.required<CompareModel>();

  private readonly resolved = signal<readonly ResolvedPanel[]>([]);

  /** Open state lives here so printing can force it — see the constructor. */
  protected readonly open = signal(false);

  private readonly visible = computed(() => {
    const model = this.model();
    return this.resolved().filter((p) => !p.descriptor.visible || p.descriptor.visible(model));
  });

  protected readonly leadPanels = computed(() =>
    this.visible().filter((p) => !p.descriptor.detail),
  );
  protected readonly detailPanels = computed(() =>
    this.visible().filter((p) => p.descriptor.detail),
  );

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

    // A printed comparison is the whole comparison. CSS cannot open a
    // `<details>`, and a closed one prints as its summary line — so the print
    // dialog opens it first. Nothing closes it again: someone who printed
    // wanted the detail, and finding it already open afterwards is the
    // outcome they were after, not a surprise.
    const expand = () => this.open.set(true);
    globalThis.addEventListener?.('beforeprint', expand);
    inject(DestroyRef).onDestroy(() => globalThis.removeEventListener?.('beforeprint', expand));
  }

  /** Keep the signal in step with clicks, and with find-in-page auto-expansion. */
  protected sync(event: Event): void {
    this.open.set((event.target as HTMLDetailsElement).open);
  }
}
