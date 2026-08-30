import { TestBed } from '@angular/core/testing';
import { getItem, type ChoiceItem, type ScaleItem } from '@mng/core';
import { ChoiceEditorComponent } from './choice-editor.component';
import { ScaleEditorComponent } from './scale-editor.component';
import { WeightControlComponent } from './weight-control.component';

/**
 * A fully expanded survey used to be 462 tab stops, because every option
 * button was one. These tests hold the survey to one stop per question, and
 * to arrow keys that work like every other composite widget.
 */
function press(el: HTMLElement, key: string): void {
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
}

function buttons(el: HTMLElement): HTMLButtonElement[] {
  return [...el.querySelectorAll('button')];
}

/** The options a Tab press could actually land on. */
function tabStops(el: HTMLElement): HTMLButtonElement[] {
  return buttons(el).filter((b) => b.tabIndex === 0);
}

describe('option groups', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({}).compileComponents();
  });

  function renderChoice(value?: number) {
    const fixture = TestBed.createComponent(ChoiceEditorComponent);
    fixture.componentRef.setInput('item', getItem('ls.alcohol')!.item as ChoiceItem);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return fixture;
  }

  it('offers one tab stop for a whole row of options', async () => {
    const fixture = renderChoice();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(buttons(el).length).toBeGreaterThan(3);
    expect(tabStops(el)).toHaveLength(1);
  });

  // Coming back to an answered question should land on the answer, not send
  // you arrowing across the row to find where you are.
  it('puts the tab stop on the chosen option', async () => {
    const fixture = renderChoice(2);
    await fixture.whenStable();
    const stops = tabStops(fixture.nativeElement);
    expect(stops).toHaveLength(1);
    expect(stops[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('moves with the arrow keys and wraps at both ends', async () => {
    const fixture = renderChoice();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const opts = buttons(el);

    opts[0].focus();
    press(el, 'ArrowRight');
    expect(document.activeElement).toBe(opts[1]);

    press(el, 'ArrowLeft');
    press(el, 'ArrowLeft');
    expect(document.activeElement, 'wraps backwards off the first option').toBe(
      opts[opts.length - 1],
    );

    press(el, 'ArrowRight');
    expect(document.activeElement, 'wraps forwards off the last option').toBe(opts[0]);
  });

  it('jumps to the ends with Home and End', async () => {
    const fixture = renderChoice();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const opts = buttons(el);

    opts[1].focus();
    press(el, 'End');
    expect(document.activeElement).toBe(opts[opts.length - 1]);
    press(el, 'Home');
    expect(document.activeElement).toBe(opts[0]);
  });

  // Arrow keys inside a composite widget must not also scroll the page.
  it('claims the arrow keys it handles', async () => {
    const fixture = renderChoice();
    await fixture.whenStable();
    buttons(fixture.nativeElement)[0].focus();
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    document.activeElement?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves keys it does not handle alone, so Tab still leaves the group', async () => {
    const fixture = renderChoice();
    await fixture.whenStable();
    buttons(fixture.nativeElement)[0].focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('collapses a seven-tick scale to a single stop', async () => {
    const fixture = TestBed.createComponent(ScaleEditorComponent);
    fixture.componentRef.setInput('item', getItem('va.together')!.item as ScaleItem);
    fixture.componentRef.setInput('value', undefined);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(buttons(el)).toHaveLength(7);
    expect(tabStops(el)).toHaveLength(1);
  });
});

describe('the importance control', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({}).compileComponents();
  });

  function renderWeight() {
    const fixture = TestBed.createComponent(WeightControlComponent);
    fixture.componentRef.setInput('item', getItem('ls.alcohol')!.item);
    fixture.detectChanges();
    return fixture;
  }

  // Which importance is set was carried by a highlight class alone, so a
  // screen reader was told nothing about the state of the control.
  it('says which importance is selected, not just colours it', () => {
    const el: HTMLElement = renderWeight().nativeElement;
    const pressed = buttons(el).filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent?.trim()).toBe('Default');
  });

  it('names the group instead of leaving a bare row of buttons', () => {
    const el: HTMLElement = renderWeight().nativeElement;
    const group = el.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toContain('Alcohol');
  });

  it('is one tab stop, like every other option row', async () => {
    const fixture = renderWeight();
    await fixture.whenStable();
    expect(tabStops(fixture.nativeElement)).toHaveLength(1);
  });
});
