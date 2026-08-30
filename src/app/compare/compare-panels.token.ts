// The datavis extension point. Each compare "panel" is a lazily loaded
// standalone component receiving the precomputed CompareModel. Adding a new
// chart format to the compare view = one component + one provideComparePanel()
// line in app.config.ts. Order positions it; visible() gates it per model.
import { InjectionToken, type InputSignal, type Provider, type Type } from '@angular/core';
import type { CompareModel } from './compare-model';

export interface ComparePanelComponent {
  readonly model: InputSignal<CompareModel>;
}

export interface ComparePanelDescriptor {
  readonly id: string;
  readonly order: number;
  readonly loadComponent: () => Promise<Type<ComparePanelComponent>>;
  /** Omit to always show (when 2+ profiles decoded). */
  readonly visible?: (model: CompareModel) => boolean;
  /**
   * Put this panel behind the page's one disclosure rather than in the lead.
   *
   * The lead is the answer: the headline number, the dealbreakers, and the
   * sentences that say what the numbers mean. Everything else is evidence for
   * that answer — worth having, worth being able to quote, and not worth
   * scrolling past on the way to it. A panel that is evidence sets this; a
   * panel that is the answer does not.
   */
  readonly detail?: boolean;
}

export const COMPARE_PANELS = new InjectionToken<ComparePanelDescriptor[]>(
  'menagerie.compare.panels',
);

export function provideComparePanel(descriptor: ComparePanelDescriptor): Provider {
  return { provide: COMPARE_PANELS, useValue: descriptor, multi: true };
}
