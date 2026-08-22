import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { AnswerValue, TextItem } from '@moxy/core';

@Component({
  selector: 'moxy-text-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="field-label">{{ item().label }}</span>
    @if (item().hint; as hint) { <div class="field-hint">{{ hint }}</div> }
    @if (item().short) {
      <input type="text" autocomplete="off"
             [attr.list]="item().suggest ? listId() : null"
             [value]="text()"
             (input)="onInput($any($event.target).value)"
             [attr.aria-label]="item().label">
      @if (item().suggest; as suggest) {
        <datalist [id]="listId()">
          @for (s of suggest; track s) { <option [value]="s"></option> }
        </datalist>
      }
    } @else {
      <textarea (input)="onInput($any($event.target).value)"
                [value]="text()" [attr.aria-label]="item().label"></textarea>
    }
  `,
})
export class TextEditorComponent {
  readonly item = input.required<TextItem>();
  readonly value = input.required<AnswerValue | undefined>();
  readonly valueChange = output<AnswerValue | undefined>();

  protected text(): string {
    const v = this.value();
    return typeof v === 'string' ? v : '';
  }

  protected listId(): string {
    return 'dl-' + this.item().id.replace(/\W/g, '');
  }

  protected onInput(raw: string): void {
    this.valueChange.emit(raw.trim() === '' ? undefined : raw);
  }
}
