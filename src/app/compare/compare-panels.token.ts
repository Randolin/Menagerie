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
}

export const COMPARE_PANELS = new InjectionToken<ComparePanelDescriptor[]>('moxy.compare.panels');

export function provideComparePanel(descriptor: ComparePanelDescriptor): Provider {
  return { provide: COMPARE_PANELS, useValue: descriptor, multi: true };
}
