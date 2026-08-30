import { Directive, ElementRef, HostListener, afterNextRender, inject } from '@angular/core';

/** Keys that move within the group rather than out of it. */
const MOVES: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * One tab stop per question instead of one per option.
 *
 * Every answer control here is a row of buttons, and each button was its own
 * tab stop: 7 for a scale, 4 per interest item, one per choice. A fully
 * expanded survey came to 462 Tab presses — 70 of them to cross "What I
 * value" alone. Keyboard users were paying a toll no mouse user could see.
 *
 * This is the composite-widget pattern: the group holds a single tab stop,
 * arrows move between options inside it, Home and End jump to the ends. The
 * buttons keep their `aria-pressed` toggle semantics, which matters — these
 * controls are deselectable (clicking the chosen option clears the answer,
 * because every question here is optional), and that is precisely what a
 * `role="radio"` group may not do. Announcing them as radios would be tidier
 * and would lie.
 *
 * The tab stop follows the selection, so returning to a question by Tab lands
 * on the answer that is already given rather than back at the first option.
 */
@Directive({ selector: '[mngOptionGroup]' })
export class OptionGroupDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Before this runs every button is a tab stop; after it, exactly one is.
    // It has to happen on render, or the group would be unreachable by Tab.
    afterNextRender(() => this.syncTabStops());
  }

  private options(): HTMLButtonElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLButtonElement>('button')];
  }

  /** The pressed option owns the tab stop; with none pressed, the first does. */
  private syncTabStops(): void {
    const options = this.options();
    const pressed = options.findIndex((b) => b.getAttribute('aria-pressed') === 'true');
    const stop = pressed === -1 ? 0 : pressed;
    options.forEach((button, i) => {
      button.tabIndex = i === stop ? 0 : -1;
    });
  }

  /**
   * Re-sync whenever the group is entered or its selection changes. Cheaper
   * and more robust than observing mutations: the DOM is small, and the only
   * moments the right tab stop can change are the ones handled here.
   */
  @HostListener('focusin')
  @HostListener('click')
  protected onInteract(): void {
    this.syncTabStops();
  }

  @HostListener('keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    const step = MOVES[event.key];
    const isEdge = event.key === 'Home' || event.key === 'End';
    if (step === undefined && !isEdge) return;

    const options = this.options();
    if (options.length === 0) return;
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;

    // Wrapping, so a row of options behaves like every other composite
    // widget rather than dead-ending at its edges.
    const next = isEdge
      ? event.key === 'Home'
        ? 0
        : options.length - 1
      : (current + step + options.length) % options.length;

    // Arrow keys inside a group must not also scroll the page.
    event.preventDefault();
    options[current].tabIndex = -1;
    options[next].tabIndex = 0;
    options[next].focus();
  }
}
