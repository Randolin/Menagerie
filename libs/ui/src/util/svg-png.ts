/**
 * Rasterise an inline SVG string to a PNG blob.
 *
 * The QR is generated as SVG because that is what stays crisp at any size and
 * what the styled renderer produces. But an SVG is awkward to hand to another
 * person: messaging apps preview it inconsistently or refuse it, and printing
 * one means opening it in something first. A PNG is the format a share sheet,
 * a chat window and a printer all agree on.
 *
 * Drawn through an Image + canvas rather than a library: the SVG is our own
 * markup with no external references, so the canvas never taints and toBlob
 * stays available.
 */
export async function svgToPngBlob(svg: string, size = 640): Promise<Blob | null> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('QR image failed to load'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // The QR needs an opaque ground: a transparent PNG dropped on a dark chat
    // background inverts the code and stops scanning.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Hand a file to the person: the OS share sheet where there is one (which is
 * the case that matters, since a QR is usually shared from a phone), a
 * download everywhere else. Returns what actually happened so the caller can
 * say so.
 */
export async function shareOrDownload(blob: Blob, filename: string): Promise<'shared' | 'saved'> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (err) {
      // A cancelled share sheet is not a failure, and must not fall through to
      // a surprise download.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return 'saved';
}
