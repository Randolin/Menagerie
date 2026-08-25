import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { AnswerValue, Item } from '@moxy/core';
import { DraftStore } from '../../stores/draft.store';
import { ChoiceEditorComponent } from './choice-editor.component';
import { MultiEditorComponent } from './multi-editor.component';
import { ScaleEditorComponent } from './scale-editor.component';
import { InterestEditorComponent } from './interest-editor.component';

/**
 * Dispatches an item to its per-type editor and wires answers into the
 * DraftStore. A new item TYPE needs a branch here — @switch over item.type
 * plus the typed editors keeps that a template-compile-time concern.
 */
@Component({
  selector: 'moxy-item-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ChoiceEditorComponent,
    MultiEditorComponent,
    ScaleEditorComponent,
    InterestEditorComponent,
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
    </div>
  `,
})
export class ItemEditorComponent {
  readonly item = input.required<Item>();
  private readonly draft = inject(DraftStore);

  protected value(): AnswerValue | undefined {
    return this.draft.answers()[this.item().id];
  }

  protected set(v: AnswerValue | undefined): void {
    this.draft.set(this.item().id, v);
  }
}
