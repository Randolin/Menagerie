import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import type { Persona } from '@moxy/core';
import qrcode from 'qrcode-generator';
import { blobPath } from './qr-path';
import { IconComponent } from './icon.component';
import { shareOrDownload, svgToPngBlob } from '../util/svg-png';
import { ToastService } from './toast.service';
import { creatureSpriteRects } from '../creatures/pixel-art';

let gradientSeq = 0;

/**
 * QR code for a share URL. Without a persona it renders the library's plain
 * SVG at error level M, exactly as before. With a persona it hand-builds a
 * styled SVG from the module matrix — dark modules fused into rounded blobs
 * (see qr-path.ts) filled with a two-stop gradient from the persona color
 * into the creature's adjB hue, classic concentric finder "eyes" (outer ring
 * in the persona color, pupil in the adjB hue — geometry untouched, and
 * detectors binarize so color is invisible to them), 4-module quiet zone,
 * and (at error level H only) a white center badge holding the creature.
 *
 * Fallback ladder when a persona is present: 'H' + badge → payload too big
 * for H → 'M' styled color, NO badge (occlusion is only safe under H's 30%
 * correction) → too big for M → the "share the link instead" note.
 *
 * Both gradient stops come from tables spec-bounded at relative luminance
 * ≤ 0.20, so every point of the gradient keeps QR-safe contrast on white.
 *
 * The SVG is generated locally from our own strings and shapes, so
 * bypassing sanitization here is sound.
 */
@Component({
  selector: 'moxy-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="qr-box">
      @if (svg(); as s) {
        <div class="qr-svg" [innerHTML]="s"></div>
        @if (shareAs(); as name) {
          <button
            class="btn btn-small qr-share"
            [disabled]="busy()"
            (click)="shareImage(name)"
            i18n-title
            title="Save or share the QR code as an image"
          >
            <moxy-icon [name]="canShare ? 'share' : 'download'" />
            @if (busy()) {
              <span i18n>Working…</span>
            } @else if (canShare) {
              <span i18n>Share QR</span>
            } @else {
              <span i18n>Save QR</span>
            }
          </button>
        }
      } @else {
        <p i18n class="fine">This profile is too large for a QR code — share the link instead.</p>
      }
    </div>
  `,
  // Unscoped on purpose: the svg arrives via innerHTML, so emulated
  // encapsulation attributes would never reach it.
  encapsulation: ViewEncapsulation.None,
  styles: `
    moxy-qr-code .qr-svg > svg {
      width: 208px;
      height: 208px;
      display: block;
    }
    moxy-qr-code .qr-share {
      margin-top: 10px;
      width: 100%;
    }
  `,
})
export class QrCodeComponent {
  /**
   * Filename stem for the shared image, e.g. `brave-amber-otter`. Absent means
   * no share button — the compare and group views embed QRs they do not own.
   */
  readonly shareAs = input<string | null>(null);

  private readonly toast = inject(ToastService);
  protected readonly busy = signal(false);
  /** Read once: it decides the button's verb, and it cannot change mid-session. */
  protected readonly canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  protected async shareImage(name: string): Promise<void> {
    const markup = this.markup();
    if (!markup || this.busy()) return;
    this.busy.set(true);
    try {
      const png = await svgToPngBlob(markup);
      if (!png) throw new Error('Could not render the QR code.');
      const how = await shareOrDownload(png, `menagerie-${name}.png`);
      if (how === 'saved') this.toast.show($localize`QR code saved`);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  readonly text = input.required<string>();
  readonly persona = input<Persona | null>(null);
  private readonly sanitizer = inject(DomSanitizer);

  /**
   * The raw markup, kept separate from the sanitized value: the template needs
   * SafeHtml, and the PNG exporter needs the string it was made from.
   */
  private readonly markup = computed<string | null>(() => {
    const persona = this.persona();
    if (!persona) {
      const plain = this.make('M');
      return plain ? plain.createSvgTag({ cellSize: 3, margin: 2, scalable: true }) : null;
    }
    const high = this.make('H');
    if (high) return this.styledSvg(high, persona, true);
    const medium = this.make('M');
    if (medium) return this.styledSvg(medium, persona, false);
    return null;
  });

  protected readonly svg = computed<SafeHtml | null>(() => {
    const raw = this.markup();
    return raw === null ? null : this.sanitizer.bypassSecurityTrustHtml(raw);
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
    const color2 = persona.color2;
    // Instance-unique gradient id: these SVGs land in the shared page DOM
    // via innerHTML, and duplicate ids would cross-wire fills between two
    // rendered QRs (dashboard + group page).
    const gid = `qr-g-${gradientSeq++}`;
    const inFinder = (r: number, c: number): boolean =>
      (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

    const parts: string[] = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
        `role="img" aria-label="QR code for this profile link">`,
      `<rect width="${size}" height="${size}" fill="#ffffff"/>`,
      `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0.55" y2="1">` +
        `<stop offset="0" stop-color="${color}"/>` +
        `<stop offset="1" stop-color="${color2}"/>` +
        `</linearGradient></defs>`,
    );

    // Data modules fused into blobs. Finder areas are masked out of the
    // neighbor checks and drawn as classic concentric squares below —
    // detectors lock on faster that way (the always-light separator ring
    // means data modules never actually abut finder modules).
    const dark = (r: number, c: number): boolean => qr.isDark(r, c) && !inFinder(r, c);
    parts.push(`<path d="${blobPath(dark, n, quiet)}" fill="url(#${gid})"/>`);

    for (const [fr, fc] of [
      [0, 0],
      [0, n - 7],
      [n - 7, 0],
    ] as const) {
      const x = fc + quiet;
      const y = fr + quiet;
      parts.push(
        `<rect x="${x}" y="${y}" width="7" height="7" rx="1.75" fill="${color}"/>`,
        `<rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="1.25" fill="#ffffff"/>`,
        `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.75" fill="${color2}"/>`,
      );
    }

    if (badge) {
      // Occludes ~3.8% of the symbol — far inside H's 30% correction.
      const cx = size / 2;
      const radius = (n * 0.22) / 2;
      parts.push(
        `<circle cx="${cx}" cy="${cx}" r="${radius}" fill="#ffffff" stroke="${color}" stroke-width="0.35"/>`,
      );
      // The pixel creature when we have one (words[2] is the animal name);
      // the emoji glyph otherwise. An inscribed square keeps the sprite
      // inside the badge circle.
      const rects = creatureSpriteRects(persona.words[2]);
      if (rects) {
        const side = radius * 1.35;
        parts.push(
          `<svg x="${(cx - side / 2).toFixed(2)}" y="${(cx - side / 2).toFixed(2)}" ` +
            `width="${side.toFixed(2)}" height="${side.toFixed(2)}" viewBox="0 0 16 16" ` +
            `shape-rendering="crispEdges">${rects}</svg>`,
        );
      } else {
        const emoji = persona.emoji.replace(/[<>&"']/g, '');
        parts.push(
          `<text x="${cx}" y="${cx}" font-size="${(n * 0.16).toFixed(2)}" ` +
            `text-anchor="middle" dominant-baseline="central">${emoji}</text>`,
        );
      }
    }

    parts.push('</svg>');
    return parts.join('');
  }
}
