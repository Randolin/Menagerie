import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import type { Persona } from '@moxy/core';
import qrcode from 'qrcode-generator';

/**
 * QR code for a share URL. Without a persona it renders the library's plain
 * SVG at error level M, exactly as before. With a persona it hand-builds a
 * styled SVG from the module matrix — persona-colored rounded modules,
 * classic concentric finder corners, 4-module quiet zone, and (at error
 * level H only) a white center badge holding the creature emoji.
 *
 * Fallback ladder when a persona is present: 'H' + badge → payload too big
 * for H → 'M' styled color, NO badge (occlusion is only safe under H's 30%
 * correction) → too big for M → the "share the link instead" note.
 *
 * The SVG is generated locally from our own strings and shapes, so
 * bypassing sanitization here is sound.
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
  readonly persona = input<Persona | null>(null);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly svg = computed<SafeHtml | null>(() => {
    const persona = this.persona();
    if (!persona) {
      const plain = this.make('M');
      if (!plain) return null;
      return this.sanitizer.bypassSecurityTrustHtml(
        plain.createSvgTag({ cellSize: 3, margin: 2, scalable: true }),
      );
    }
    const high = this.make('H');
    if (high) {
      return this.sanitizer.bypassSecurityTrustHtml(this.styledSvg(high, persona, true));
    }
    const medium = this.make('M');
    if (medium) {
      return this.sanitizer.bypassSecurityTrustHtml(this.styledSvg(medium, persona, false));
    }
    return null;
  });

  private make(level: 'M' | 'H'): ReturnType<typeof qrcode> | null {
    try {
      const qr = qrcode(0, level);
      qr.addData(this.text(), 'Byte');
      qr.make();
      return qr;
    } catch {
      return null;
    }
  }

  private styledSvg(qr: ReturnType<typeof qrcode>, persona: Persona, badge: boolean): string {
    const n = qr.getModuleCount();
    const quiet = 4;
    const size = n + quiet * 2;
    const color = persona.color;
    const inFinder = (r: number, c: number): boolean =>
      (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

    const parts: string[] = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
        `role="img" aria-label="QR code for this profile link">`,
      `<rect width="${size}" height="${size}" fill="#ffffff"/>`,
    );

    // Data modules: rounded dots. Finder areas are skipped and drawn as
    // classic concentric squares below — detectors lock on faster that way.
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!qr.isDark(r, c) || inFinder(r, c)) continue;
        parts.push(
          `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1" rx="0.3" fill="${color}"/>`,
        );
      }
    }

    for (const [fr, fc] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
      const x = fc + quiet;
      const y = fr + quiet;
      parts.push(
        `<rect x="${x}" y="${y}" width="7" height="7" rx="1.75" fill="${color}"/>`,
        `<rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="1.25" fill="#ffffff"/>`,
        `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.75" fill="${color}"/>`,
      );
    }

    if (badge) {
      // Occludes ~3.8% of the symbol — far inside H's 30% correction.
      const cx = size / 2;
      const radius = (n * 0.22) / 2;
      const emoji = persona.emoji.replace(/[<>&"']/g, '');
      parts.push(
        `<circle cx="${cx}" cy="${cx}" r="${radius}" fill="#ffffff" stroke="${color}" stroke-width="0.35"/>`,
        `<text x="${cx}" y="${cx}" font-size="${(n * 0.16).toFixed(2)}" ` +
          `text-anchor="middle" dominant-baseline="central">${emoji}</text>`,
      );
    }

    parts.push('</svg>');
    return parts.join('');
  }
}
