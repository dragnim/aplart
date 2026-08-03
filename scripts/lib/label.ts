/**
 * Drawing short labels into an RGBA image.
 *
 * A montage of sixteen panels is useless without them, and Node has no canvas
 * and no font. So: a 3×5 bitmap alphabet, scaled up, covering only what a panel
 * caption needs. Anything it cannot draw becomes a space rather than an
 * exception — a missing glyph should spoil a caption, not lose a comparison.
 *
 * Deliberately not a text engine. No kerning, no wrapping, no measurement API
 * beyond the width of a string.
 */

import { type RgbaSource } from './encodePng';

/** Three columns by five rows, one string per row, `#` for ink. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '0': ['###', '# #', '# #', '# #', '###'],
  '1': [' # ', '## ', ' # ', ' # ', '###'],
  '2': ['###', '  #', '###', '#  ', '###'],
  '3': ['###', '  #', '###', '  #', '###'],
  '4': ['# #', '# #', '###', '  #', '  #'],
  '5': ['###', '#  ', '###', '  #', '###'],
  '6': ['###', '#  ', '###', '# #', '###'],
  '7': ['###', '  #', '  #', '  #', '  #'],
  '8': ['###', '# #', '###', '# #', '###'],
  '9': ['###', '# #', '###', '  #', '###'],
  A: ['###', '# #', '###', '# #', '# #'],
  B: ['## ', '# #', '## ', '# #', '## '],
  C: ['###', '#  ', '#  ', '#  ', '###'],
  D: ['## ', '# #', '# #', '# #', '## '],
  E: ['###', '#  ', '###', '#  ', '###'],
  F: ['###', '#  ', '###', '#  ', '#  '],
  G: ['###', '#  ', '# #', '# #', '###'],
  H: ['# #', '# #', '###', '# #', '# #'],
  I: ['###', ' # ', ' # ', ' # ', '###'],
  J: ['###', '  #', '  #', '# #', '###'],
  K: ['# #', '# #', '## ', '# #', '# #'],
  L: ['#  ', '#  ', '#  ', '#  ', '###'],
  M: ['# #', '###', '###', '# #', '# #'],
  N: ['## ', '# #', '# #', '# #', '# #'],
  O: ['###', '# #', '# #', '# #', '###'],
  P: ['###', '# #', '###', '#  ', '#  '],
  Q: ['###', '# #', '###', '  #', '  #'],
  R: ['###', '# #', '## ', '# #', '# #'],
  S: ['###', '#  ', '###', '  #', '###'],
  T: ['###', ' # ', ' # ', ' # ', ' # '],
  U: ['# #', '# #', '# #', '# #', '###'],
  V: ['# #', '# #', '# #', '# #', ' # '],
  W: ['# #', '# #', '###', '###', '# #'],
  X: ['# #', '# #', ' # ', '# #', '# #'],
  Y: ['# #', '# #', '###', ' # ', ' # '],
  Z: ['###', '  #', ' # ', '#  ', '###'],
  '×': ['   ', '# #', ' # ', '# #', '   '],
  '-': ['   ', '   ', '###', '   ', '   '],
  '.': ['   ', '   ', '   ', '   ', ' # '],
  ':': ['   ', ' # ', '   ', ' # ', '   '],
  '/': ['  #', '  #', ' # ', '#  ', '#  '],
  '%': ['# #', '  #', ' # ', '#  ', '# #'],
  '(': [' ##', ' # ', ' # ', ' # ', ' ##'],
  ')': ['## ', ' # ', ' # ', ' # ', '## '],
  ' ': ['   ', '   ', '   ', '   ', '   '],
};

const GLYPH_WIDTH = 3;
const GLYPH_HEIGHT = 5;
const GAP = 1;

/** Width in pixels a string will occupy at the given scale. */
export function labelWidth(text: string, scale: number): number {
  return text.length === 0 ? 0 : (text.length * (GLYPH_WIDTH + GAP) - GAP) * scale;
}

export function labelHeight(scale: number): number {
  return GLYPH_HEIGHT * scale;
}

/**
 * Draws `text` into `image` with its top-left corner at (x, y).
 *
 * Mutates the image, which is what every caller wants and saves copying a
 * megapixel buffer per caption.
 */
export function drawLabel(
  image: RgbaSource,
  text: string,
  x: number,
  y: number,
  options: { readonly scale?: number; readonly colour?: readonly [number, number, number] } = {},
): void {
  const scale = options.scale ?? 2;
  const [r, g, b] = options.colour ?? [255, 255, 255];
  const data = image.data as Uint8ClampedArray;

  let penX = x;
  for (const character of text.toUpperCase()) {
    const glyph = GLYPHS[character] ?? GLYPHS[' '];
    if (glyph === undefined) continue;

    glyph.forEach((row, rowIndex) => {
      [...row].forEach((cell, columnIndex) => {
        if (cell !== '#') return;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const px = penX + columnIndex * scale + dx;
            const py = y + rowIndex * scale + dy;
            if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
            const at = (py * image.width + px) * 4;
            data[at] = r;
            data[at + 1] = g;
            data[at + 2] = b;
            data[at + 3] = 255;
          }
        }
      });
    });

    penX += (GLYPH_WIDTH + GAP) * scale;
  }
}
