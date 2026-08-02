/**
 * Turning escape counts into colours.
 *
 * The property that matters most is stability: a value of 12 is the same colour
 * in every view that shares an iteration ceiling. Almost everything here is a
 * way of checking that from a different angle — across crops, across palettes,
 * across animation phases — because it is the difference between exploring one
 * artwork and being shown a new one each time you move.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLOURING,
  MAX_BAND_WIDTH,
  MAX_THRESHOLD_BANDS,
  MIN_BAND_WIDTH,
  MIN_THRESHOLD_BANDS,
  bandCountFor,
  bandNumberFor,
  createEscapeMapper,
  normaliseColouring,
  positionOf,
  type Colouring,
  type ValueRange,
} from '@/renderer/escapeColouring';
import { fromNested } from '@/matrix/matrixTypes';
import { matrixStats } from '@/matrix/matrixStats';
import { animatePalette } from '@/renderer/paletteAnimation';
import { renderArtwork } from '@/renderer/renderArtwork';
import { type Palette } from '@/renderer/palettes';

const RANGE: ValueRange = { min: 1, max: 28 };

/** Four flat, far-apart colours, so a band change is unmistakable. */
const PALETTE: Palette = {
  id: 'test',
  name: 'Test',
  colours: ['#000000', '#ff0000', '#00ff00', '#ffffff'],
};

function colouring(overrides: Partial<Colouring> = {}): Colouring {
  return { ...DEFAULT_COLOURING, ...overrides };
}

function mapper(overrides: Partial<Colouring>, range = RANGE, palette = PALETTE) {
  return createEscapeMapper({
    palette,
    entries: palette.colours.length,
    colouring: colouring(overrides),
    range,
  });
}

function rgb(colour: { r: number; g: number; b: number }) {
  return [colour.r, colour.g, colour.b];
}

describe('positionOf', () => {
  it('places a value against the declared range, not against zero', () => {
    // The lowest value the calculation can produce is the start of the ramp.
    // Treating the range as 0–28 would leave the first colour unreachable and
    // shift every other value along by a thirtieth.
    expect(positionOf(1, RANGE)).toBe(0);
    expect(positionOf(28, RANGE)).toBe(1);
    expect(positionOf(14.5, RANGE)).toBeCloseTo(0.5, 10);
  });

  it('clamps a value from outside the range rather than running off the ramp', () => {
    expect(positionOf(-5, RANGE)).toBe(0);
    expect(positionOf(99, RANGE)).toBe(1);
  });

  it('answers the middle for a range of nothing', () => {
    expect(positionOf(7, { min: 7, max: 7 })).toBe(0.5);
  });
});

/** The pixel a rendered matrix gives value `value`, as `r,g,b`. */
function pixelFor(values: readonly (readonly number[])[], value: number, colouring: Colouring) {
  const matrix = fromNested(values.map((row) => [...row]));
  const image = renderArtwork(matrix, matrixStats(matrix), {
    mode: 'continuous',
    palette: PALETTE,
    escape: { colouring, range: RANGE, entries: PALETTE.colours.length },
  });
  const index = matrix.values.indexOf(value);
  const at = index * 4;
  return [image.data[at], image.data[at + 1], image.data[at + 2]].join(',');
}

describe('the smooth gradient', () => {
  it('normalises against the declared range and not against what a view holds', () => {
    /*
     * The heart of it. Two crops of the same artwork, one holding 5 to 9 and
     * one holding 1 to 28. Normalising against contents would put 9 at the top
     * of the ramp in the first and a third of the way up in the second, so the
     * artwork would repaint itself every time somebody moved.
     */
    const shallow = [
      [5, 6],
      [7, 9],
    ];
    const wide = [
      [1, 9],
      [17, 28],
    ];
    const settings = colouring({ mode: 'smooth' });

    expect(pixelFor(shallow, 9, settings)).toBe(pixelFor(wide, 9, settings));

    // And it really is a third of the way up rather than the top of the ramp:
    // 9 and the largest value in its own crop are different colours.
    expect(pixelFor(shallow, 9, settings)).not.toBe(pixelFor(wide, 28, settings));
  });

  it('holds every value steady between two views, not just one', () => {
    const settings = colouring({ mode: 'smooth' });
    const shared = [4, 12, 19];
    const left = [[1, 4, 12, 19]];
    const right = [[4, 12, 19, 28]];
    for (const value of shared) {
      expect(pixelFor(left, value, settings)).toBe(pixelFor(right, value, settings));
    }
  });

  it('remaps when the ceiling changes, because the numbers now mean something else', () => {
    const at28 = mapper({ mode: 'smooth' });
    const at60 = mapper({ mode: 'smooth' }, { min: 1, max: 60 });

    // 28 is the top of one range and under half of the other.
    expect(rgb(at28(28))).not.toEqual(rgb(at60(28)));
    expect(rgb(at28(1))).toEqual(rgb(at60(1)));
  });
});

describe('iteration bands', () => {
  it('gives equal values equal colours', () => {
    const bands = mapper({ mode: 'bands' });
    expect(rgb(bands(11))).toEqual(rgb(bands(11)));
  });

  it('divides the declared range into one band per palette entry', () => {
    const bands = mapper({ mode: 'bands' });
    const distinct = new Set(Array.from({ length: 28 }, (_unused, index) => rgb(bands(index + 1)).join(',')));
    expect(distinct.size).toBe(PALETTE.colours.length);
  });

  it('puts the ends of the range in the first and last bands', () => {
    const bands = mapper({ mode: 'bands' });
    expect(bandNumberFor(1, RANGE, colouring({ mode: 'bands' }), 4)).toBe(1);
    expect(bandNumberFor(28, RANGE, colouring({ mode: 'bands' }), 4)).toBe(4);
    expect(rgb(bands(1))).not.toEqual(rgb(bands(28)));
  });
});

describe('repeating bands', () => {
  it('cycles through the palette every bandWidth iterations', () => {
    const width = 4;
    const repeating = mapper({ mode: 'repeating', bandWidth: width });
    const entries = PALETTE.colours.length;

    for (let value = RANGE.min; value <= RANGE.max; value += 1) {
      const step = Math.floor((value - RANGE.min) / width);
      const expected = repeating(RANGE.min + (step % entries) * width);
      expect(rgb(repeating(value))).toEqual(rgb(expected));
    }
  });

  it('starts its first band at the smallest value the calculation can produce', () => {
    const repeating = mapper({ mode: 'repeating', bandWidth: 4 });
    // 1 to 4 share a band; 5 begins the next one.
    expect(rgb(repeating(1))).toEqual(rgb(repeating(4)));
    expect(rgb(repeating(4))).not.toEqual(rgb(repeating(5)));
  });

  it('never divides by less than one, whatever it is handed', () => {
    for (const bandWidth of [0, -3, 0.2, Number.NaN]) {
      const repeating = mapper({ mode: 'repeating', bandWidth });
      // A width below one would put every value in its own band, or divide by
      // zero. It is floored instead, so the artwork still draws.
      expect(() => repeating(7)).not.toThrow();
      expect(rgb(repeating(7))).toHaveLength(3);
    }
  });
});

describe('reached the limit, or not', () => {
  it('separates the two and nothing else', () => {
    const insideOutside = mapper({ mode: 'insideOutside' });
    const distinct = new Set(
      Array.from({ length: 28 }, (_unused, index) => rgb(insideOutside(index + 1)).join(',')),
    );
    expect(distinct.size).toBe(2);
  });

  it('draws the split at the declared ceiling', () => {
    const insideOutside = mapper({ mode: 'insideOutside' });
    expect(rgb(insideOutside(27))).toEqual(rgb(insideOutside(1)));
    expect(rgb(insideOutside(28))).not.toEqual(rgb(insideOutside(27)));
  });

  it('moves the split when the ceiling moves', () => {
    const at60 = mapper({ mode: 'insideOutside' }, { min: 1, max: 60 });
    // 28 reached the limit under the old ceiling and escaped under this one.
    expect(rgb(at60(28))).toEqual(rgb(at60(1)));
    expect(rgb(at60(60))).not.toEqual(rgb(at60(28)));
  });
});

describe('threshold bands', () => {
  it('cuts the range into the requested number of equal bands', () => {
    for (const count of [2, 6, 9]) {
      const threshold = mapper({ mode: 'threshold', thresholdBands: count });
      const distinct = new Set(
        Array.from({ length: 28 }, (_unused, index) => rgb(threshold(index + 1)).join(',')),
      );
      // Never more bands than there are distinct values to fall in them.
      expect(distinct.size).toBe(Math.min(count, 28));
    }
  });

  it('stays valid when the ceiling changes', () => {
    /*
     * Stored as a count rather than as a list of iteration values, which is the
     * whole reason this holds. Six thresholds saved against a ceiling of 28
     * would have left three of them above a ceiling of 12, and three bands that
     * no value could reach.
     */
    const settings = colouring({ mode: 'threshold', thresholdBands: 6 });
    for (const max of [12, 28, 60]) {
      const range = { min: 1, max };
      const bands = new Set(
        Array.from({ length: max }, (_unused, index) => bandNumberFor(index + 1, range, settings, 4)).filter(
          (band) => band !== null,
        ),
      );
      expect(bands.size).toBe(Math.min(6, max));
      expect(Math.min(...bands)).toBe(1);
      expect(Math.max(...bands)).toBe(6);
    }
  });
});

describe('a matrix with no variation in it', () => {
  it('stays one flat colour under every mode', () => {
    // The stated limit of all of this: colouring reads numbers, it does not
    // invent them. A view entirely at the ceiling holds one value, and one
    // value can only ever be one colour.
    const uniform = 28;
    for (const mode of ['smooth', 'bands', 'repeating', 'insideOutside', 'threshold'] as const) {
      const paint = mapper({ mode });
      const distinct = new Set(Array.from({ length: 50 }, () => rgb(paint(uniform)).join(',')));
      expect(distinct.size).toBe(1);
    }
  });
});

describe('band numbers, for the inspector', () => {
  it('reports the band the renderer actually used', () => {
    const settings = colouring({ mode: 'repeating', bandWidth: 4 });
    const paint = mapper({ mode: 'repeating', bandWidth: 4 });

    // Same value, same band number, same colour — one arithmetic, two readings
    // of it. Values four apart change band; values in between do not.
    for (let value = 1; value <= 28; value += 1) {
      const band = bandNumberFor(value, RANGE, settings, 4);
      const other = bandNumberFor(value + 4, RANGE, settings, 4);
      expect(band).not.toBe(other);
      if (value + 1 <= 28 && (value - RANGE.min) % 4 !== 3) {
        expect(bandNumberFor(value + 1, RANGE, settings, 4)).toBe(band);
        expect(rgb(paint(value + 1))).toEqual(rgb(paint(value)));
      }
    }
  });

  it('says nothing where there is nothing to say', () => {
    for (const mode of ['smooth', 'insideOutside'] as const) {
      expect(bandNumberFor(9, RANGE, colouring({ mode }), 4)).toBeNull();
      expect(bandCountFor(colouring({ mode }), 4)).toBeNull();
    }
  });

  it('counts bands the way the mode divides them', () => {
    expect(bandCountFor(colouring({ mode: 'bands' }), 7)).toBe(7);
    expect(bandCountFor(colouring({ mode: 'repeating' }), 7)).toBe(7);
    expect(bandCountFor(colouring({ mode: 'threshold', thresholdBands: 5 }), 7)).toBe(5);
  });
});

describe('animation on top of the mapping', () => {
  /*
   * Order matters and is checked rather than assumed. Values are turned into
   * palette positions first, and the animation moves the palette underneath
   * them — so the bands stay where they are and the colours travel through
   * them, rather than the boundaries sliding about.
   */
  it('keeps band boundaries still while the colours move', () => {
    const settings = colouring({ mode: 'bands' });
    const entries = PALETTE.colours.length;

    /** Which values share a colour, as a signature of where the edges are. */
    const edges = (phase: number) => {
      const paint = createEscapeMapper({
        palette: animatePalette(PALETTE, 'rotate', phase),
        entries,
        colouring: settings,
        range: RANGE,
      });
      const changes: number[] = [];
      for (let value = RANGE.min + 1; value <= RANGE.max; value += 1) {
        if (rgb(paint(value)).join(',') !== rgb(paint(value - 1)).join(',')) changes.push(value);
      }
      return changes;
    };

    const still = edges(0);
    expect(still.length).toBeGreaterThan(0);
    for (const phase of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      // The extra stops an animation adds to close its seam must not be counted
      // as palette entries; if they were, the bands would breathe.
      expect(edges(phase)).toEqual(still);
    }
  });

  it('changes the colours it is given, or the test above proves nothing', () => {
    const settings = colouring({ mode: 'bands' });
    const at = (phase: number) =>
      rgb(
        createEscapeMapper({
          palette: animatePalette(PALETTE, 'rotate', phase),
          entries: PALETTE.colours.length,
          colouring: settings,
          range: RANGE,
        })(1),
      );
    expect(at(0.5)).not.toEqual(at(0));
  });
});

describe('normaliseColouring', () => {
  it('refuses something that names no mode', () => {
    expect(normaliseColouring(null)).toBeNull();
    expect(normaliseColouring('smooth')).toBeNull();
    expect(normaliseColouring({})).toBeNull();
    expect(normaliseColouring({ mode: 'psychedelic' })).toBeNull();
  });

  it('repairs the numbers rather than throwing the whole thing away', () => {
    // A bad band width has an obvious neighbour that draws something sensible;
    // a mode nobody has heard of does not.
    const repaired = normaliseColouring({ mode: 'repeating', bandWidth: 9000, thresholdBands: -4 });
    expect(repaired).toEqual({
      mode: 'repeating',
      bandWidth: MAX_BAND_WIDTH,
      thresholdBands: MIN_THRESHOLD_BANDS,
    });
  });

  it('fills in what is missing', () => {
    expect(normaliseColouring({ mode: 'smooth' })).toEqual(DEFAULT_COLOURING);
  });

  it('keeps a usable setting untouched', () => {
    const settings = { mode: 'threshold' as const, bandWidth: MIN_BAND_WIDTH, thresholdBands: 9 };
    expect(normaliseColouring(settings)).toEqual(settings);
  });

  it('rounds a fractional count to something a band can be made of', () => {
    const repaired = normaliseColouring({ mode: 'threshold', bandWidth: 3.7, thresholdBands: 5.2 });
    expect(repaired?.bandWidth).toBe(4);
    expect(repaired?.thresholdBands).toBe(5);
  });

  it('holds thresholds within the range the control offers', () => {
    const high = normaliseColouring({ mode: 'threshold', thresholdBands: 999 });
    expect(high?.thresholdBands).toBe(MAX_THRESHOLD_BANDS);
  });
});
