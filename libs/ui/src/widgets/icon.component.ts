import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The small line-icon set. Stroke paths on a 24-grid, inheriting currentColor
 * and sized by font-size, so an icon button needs no colour rules of its own.
 *
 * These replaced emoji on the action buttons. An emoji is a picture of someone
 * else's idea of a clipboard: it changes per platform, it carries its own
 * colour into a themed button, and it sits on the text baseline rather than
 * the button's optical centre. A path does none of that.
 */
export type IconName = 'copy' | 'link' | 'check' | 'share' | 'download';

const PATHS: Readonly<Record<IconName, string>> = {
  copy: 'M9 9h10v10H9z M5 15V5h10',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1 M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
  check: 'M5 13l4 4L19 7',
  share: 'M12 16V4 M8 8l4-4 4 4 M5 14v5h14v-5',
  download: 'M12 4v12 M8 12l4 4 4-4 M5 19h14',
};

@Component({
  selector: 'moxy-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path [attr.d]="d()" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    svg {
      width: 1.15em;
      height: 1.15em;
      display: block;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  protected readonly d = computed(() => PATHS[this.name()]);
}
