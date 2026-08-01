import { describe, expect, it } from 'vitest';
import { matrixStats } from '@/matrix/matrixStats';
import { fromNested } from '@/matrix/matrixTypes';
import { createColourMapper, parseHexColour, renderToRgba, sampleGradient } from '@/renderer/colourMapping';
import { getPalette, palettes } from '@/renderer/palettes';

const RAMP = {
  id: 'test',
  name: 'Test',
  colours: ['#000000', '#808080', '#ffffff'],
};

describe('palette definitions', () => {
  it('every colour in every palette is a valid hex value', () => {
    // A stray non-ASCII digit in a hex string is invisible in review and would
    // throw at render time.
    for (const palette of palettes) {
      for (const colour of palette.colours) {
        expect(() => parseHexColour(colour), `${palette.id}: ${colour}`).not.toThrow();
      }
      const { background } = palette;
      if (background !== undefined) {
        expect(() => parseHexColour(background), palette.id).not.toThrow();
      }
    }
  });

  it('every palette has a unique id and at least two colours', () => {
    const ids = palettes.map((palette) => palette.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const palette of palettes) {
      expect(palette.colours.length, palette.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('the Dyalog palette uses the brand orange', () => {
    expect(getPalette('dyalog').colours).toContain('#ff6a13');
  });

  it('falls back to a real palette for an unknown id', () => {
    expect(getPalette('does-not-exist').id).toBe(palettes[0]?.id);
  });
});

describe('parseHexColour', () => {
  it('reads six-digit hex', () => {
    expect(parseHexColour('#ff6a13')).toEqual({ r: 255, g: 106, b: 19 });
  });

  it('expands three-digit hex', () => {
    expect(parseHexColour('#f0a')).toEqual({ r: 255, g: 0, b: 170 });
  });

  it('rejects anything else', () => {
    expect(() => parseHexColour('orange')).toThrow();
    expect(() => parseHexColour('#gg0000')).toThrow();
  });
});

describe('sampleGradient', () => {
  const stops = RAMP.colours.map(parseHexColour);

  it('returns the ends exactly', () => {
    expect(sampleGradient(stops, 0)).toEqual({ r: 0, g: 0, b: 0 });
    expect(sampleGradient(stops, 1)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('interpolates between stops', () => {
    expect(sampleGradient(stops, 0.5)).toEqual({ r: 128, g: 128, b: 128 });
  });

  it('clamps out-of-range positions instead of wrapping', () => {
    expect(sampleGradient(stops, -5)).toEqual({ r: 0, g: 0, b: 0 });
    expect(sampleGradient(stops, 5)).toEqual({ r: 255, g: 255, b: 255 });
  });
});

describe('createColourMapper', () => {
  const matrix = fromNested([
    [0, 1],
    [2, 3],
  ]);
  const stats = matrixStats(matrix);

  it('indexes the palette directly in indexed mode, wrapping round', () => {
    const map = createColourMapper(stats, { mode: 'indexed', palette: RAMP });
    expect(map(0)).toEqual(parseHexColour('#000000'));
    expect(map(1)).toEqual(parseHexColour('#808080'));
    expect(map(2)).toEqual(parseHexColour('#ffffff'));
    expect(map(3)).toEqual(parseHexColour('#000000'));
  });

  it('keeps negative values on the ramp in indexed mode', () => {
    // A single modulo in JavaScript yields a negative index.
    const map = createColourMapper(stats, { mode: 'indexed', palette: RAMP });
    expect(map(-1)).toEqual(parseHexColour('#ffffff'));
    expect(map(-3)).toEqual(parseHexColour('#000000'));
  });

  it('normalises across the range in continuous mode', () => {
    const map = createColourMapper(stats, { mode: 'continuous', palette: RAMP });
    expect(map(0)).toEqual({ r: 0, g: 0, b: 0 });
    expect(map(3)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('uses the palette midpoint when every value is the same', () => {
    // The alternative is dividing by a zero range, which yields NaN and paints
    // nothing at all.
    const flat = fromNested([
      [5, 5],
      [5, 5],
    ]);
    const map = createColourMapper(matrixStats(flat), { mode: 'continuous', palette: RAMP });
    expect(map(5)).toEqual({ r: 128, g: 128, b: 128 });
  });

  it('splits on zero in binary mode', () => {
    const map = createColourMapper(stats, { mode: 'binary', palette: RAMP });
    expect(map(0)).toEqual(parseHexColour('#000000'));
    expect(map(1)).toEqual(parseHexColour('#ffffff'));
    expect(map(-2)).toEqual(parseHexColour('#ffffff'));
  });

  it('puts the highest value in the last band in threshold mode', () => {
    // Flooring the position would otherwise push the maximum one band past
    // the end of the ramp.
    const map = createColourMapper(stats, { mode: 'threshold', palette: RAMP, bands: 3 });
    expect(map(3)).toEqual(parseHexColour('#ffffff'));
    expect(map(0)).toEqual(parseHexColour('#000000'));
  });

  it('reverses the ramp when inverted', () => {
    const map = createColourMapper(stats, { mode: 'continuous', palette: RAMP, invert: true });
    expect(map(0)).toEqual({ r: 255, g: 255, b: 255 });
    expect(map(3)).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe('renderToRgba', () => {
  it('produces one opaque pixel per cell, in row-major order', () => {
    const matrix = fromNested([
      [0, 3],
      [3, 0],
    ]);
    const image = renderToRgba(matrix, matrixStats(matrix), {
      mode: 'continuous',
      palette: RAMP,
    });

    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
    expect(image.data).toHaveLength(16);

    // Top-left is the minimum, top-right the maximum.
    expect([...image.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...image.data.slice(4, 8)]).toEqual([255, 255, 255, 255]);
    // Every pixel is fully opaque.
    for (let index = 3; index < image.data.length; index += 4) {
      expect(image.data[index]).toBe(255);
    }
  });
});
