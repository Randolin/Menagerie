import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { Item } from '@moxy/core';
import { DraftStore } from '../../stores/draft.store';
import { ChoiceEditorComponent } from './choice-editor.component';
import { MultiEditorComponent } from './multi-editor.component';
import { ScaleEditorComponent } from './scale-editor.component';
import { InterestEditorComponent } from './interest-editor.component';
import { WeightControlComponent } from './weight-control.component';

/**
 * Dispatches an item to its per-type editor and wires answers into the
 * DraftStore. A new item TYPE needs a branch here — @switch over item.type
 * plus the typed editors keeps that a template-compile-time concern.
 * `showWeight` adds the importance row (review forms only — cards stay
 * one-tap), shown once the item has an answer to weigh.
 */
@Component({
  selector: 'moxy-item-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ChoiceEditorComponent,
    MultiEditorComponent,
    ScaleEditorComponent,
    InterestEditorComponent,
    WeightControlComponent,
  ],
  template: `
    <div class="item-block">
      @switch (item().type) {
        @case ('choice') {
          <moxy-choice-editor [item]="$any(item())" [value]="value()" (valueChange)="set($event)" />
        }
        @case ('multi') {
          <moxy-multi-editor [item]="$any(item())" [value]="value()" (valueChange)="set($event)" />
        }
        @case ('scale') {
          <moxy-scale-editor [item]="$any(item())" [value]="value()" (valueChange)="set($event)" />
        }
        @case ('interest') {
          <moxy-interest-editor
            [item]="$any(item())"
            [value]="value()"
            (valueChange)="set($event)"
          />
        }
      }
      @if (showWeight() && value() !== undefined) {
        <moxy-weight-control [item]="item()" />
      }
    </div>
  `,
})
export class ItemEditorComponent {
  readonly item = input.required<Item>();
  readonly showWeight = input(false);
  /** Fires after every answer write — the pack runner's auto-advance hook. */
  readonly answered = output<Item>();
  private readonly draft = inject(DraftStore);

  protected value(): ReturnType<DraftStore['get']> {
    return this.draft.answers()[this.item().id];
  }

  protected set(v: ReturnType<DraftStore['get']>): void {
    this.draft.set(this.item().id, v);
    this.answered.emit(this.item());
  }
}
