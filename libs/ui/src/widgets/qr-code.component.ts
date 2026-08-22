import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import qrcode from 'qrcode-generator';

/**
 * QR code for a share URL. The SVG is generated locally from our own string
 * by qrcode-generator (no network, no DOM injection beyond shapes), so
 * bypassing sanitization here is sound. Falls back to a note when the
 * payload exceeds QR capacity.
 */
@Component({
  selector: 'moxy-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="qr-box">
      @if (svg(); as s) {
        <div class="qr-svg" [innerHTML]="s"></div>
      } @else {
        <p class="fine">This profile is too large for a QR code — share the link instead.</p>
      }
    </div>
  `,
  // Unscoped on purpose: the svg arrives via innerHTML, so emulated
  // encapsulation attributes would never reach it.
  encapsulation: ViewEncapsulation.None,
  styles: `
    moxy-qr-code .qr-svg svg { width: 208px; height: 208px; display: block; }
  `,
})
export class QrCodeComponent {
  readonly text = input.required<string>();
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly svg = computed<SafeHtml | null>(() => {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(this.text(), 'Byte');
      qr.make();
      const tag = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
      return this.sanitizer.bypassSecurityTrustHtml(tag);
    } catch {
      return null;
    }
  });
}
