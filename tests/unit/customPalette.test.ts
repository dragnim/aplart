/**
 * The custom palette model, which the editor is only one way of driving.
 *
 * Most of this is about untrusted input — a link, or storage edited by hand —
 * because a palette that cannot be understood must draw *something* rather than
 * stop the artwork appearing.
 */

import { describe, expect, it } from 'vitest';
import { matrixStats } from '@/matrix/matrixStats';
import { fromNested } from '@/matrix/matrixTypes';
import { createColourMapper, parseHexColour, sampleGradient } from '@/renderer/colourMapping';
import {
  CUSTOM_PALETTE_ID,
  MAX_STOPS,
  decodeStops,
  encodeStops,
  newStopId,
  normaliseColour,
  normaliseStops,
  paletteFromStops,
  parseStops,
  stopsAreUsable,
  stopsFromPalette,
} from '@/renderer/customPalette';
import { getPalette } from '@/renderer/palettes';
import { defaultRenderOptions, paletteFor } from '@/renderer/renderOptions';

function stop(colour: string, position: number) {
  return { id: newStopId(), colour, position };
}

describe('normaliseColour', () => {
  it('accepts the forms somebody would actually type', () => {
    expect(normaliseColour('#FF6A13')).toBe('#ff6a13');
    expect(normaliseColour('ff6a13')).toBe('#ff6a13');
    expect(normaliseColour('  #f00  ')).toBe('#ff0000');
    expect(normaliseColour('f00')).toBe('#ff0000');
  });

  it('refuses anything else', () => {
    for (const value of ['', '#', 'red', '#12345', '#1234567', 'ff6a1g', '#ff 6a13']) {
      expect(normaliseColour(value), value).toBeNull();
    }
  });
});

describe('normaliseStops', () => {
  it('puts the stops in position order', () => {
    const ordered = normaliseStops([stop('#ffffff', 100), stop('#000000', 0), stop('#888888', 50)]);
    expect(ordered.map((entry) => entry.position)).toEqual([0, 50, 100]);
  });

  it('keeps the given order when two share a place', () => {
    // Which one wins for values above the shared position, and therefore which
    // way round the hard edge falls.
    const ordered = normaliseStops([stop('#111111', 50), stop('#222222', 50)]);
    expect(ordered.map((entry) => entry.colour)).toEqual(['#111111', '#222222']);
  });

  it('holds positions inside the range', () => {
    const ordered = normaliseStops([stop('#000000', -40), stop('#ffffff', 250)]);
    expect(ordered.map((entry) => entry.position)).toEqual([0, 100]);
  });

  it('replaces a colour it cannot read rather than dropping the stop', () => {
    // Dropping it would silently change the shape of the ramp.
    expect(normaliseStops([stop('nonsense', 0), stop('#ffffff', 100)])).toHaveLength(2);
  });

  it('keeps the ids, so a control does not lose its place', () => {
    const first = stop('#ffffff', 100);
    const second = stop('#000000', 0);
    expect(normaliseStops([first, second]).map((entry) => entry.id)).toEqual([second.id, first.id]);
  });
});

describe('paletteFromStops', () => {
  it('produces a palette the renderer can use unchanged', () => {
    const palette = paletteFromStops([stop('#000000', 0), stop('#ff0000', 25), stop('#ffffff', 100)]);

    expect(palette.id).toBe(CUSTOM_PALETTE_ID);
    expect(palette.colours).toEqual(['#000000', '#ff0000', '#ffffff']);
    // Fractions for the ramp, per cent for the control.
    expect(palette.positions).toEqual([0, 0.25, 1]);
    expect(palette.background).toBe('#000000');
  });
});

describe('sampling a positioned ramp', () => {
  const ramp = ['#000000', '#ff0000', '#ffffff'].map(parseHexColour);

  it('honours where the stops are', () => {
    // A quarter of the way along is exactly the middle stop, which even spacing
    // would have put at a half.
    expect(sampleGradient(ramp, 0.25, [0, 0.25, 1])).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('still spaces evenly when no positions are given', () => {
    // Every shipped palette relies on this, so it cannot change.
    expect(sampleGradient(ramp, 0.5)).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('holds the end colours beyond the outermost stops', () => {
    expect(sampleGradient(ramp, 0.05, [0.2, 0.5, 0.8])).toEqual({ r: 0, g: 0, b: 0 });
    expect(sampleGradient(ramp, 0.95, [0.2, 0.5, 0.8])).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('makes a hard edge where two stops share a place', () => {
    // And does not divide by the nothing between them.
    const edge = sampleGradient(ramp, 0.5, [0, 0.5, 0.5]);
    expect(Number.isNaN(edge.r)).toBe(false);
    expect(edge).toEqual({ r: 255, g: 255, b: 255 });
  });
});

describe('paletteFor', () => {
  const base = defaultRenderOptions('ember');

  it('gives the named ramp when no custom palette is chosen', () => {
    expect(paletteFor(base).id).toBe('ember');
  });

  it('gives the custom ramp when it is', () => {
    const options = {
      ...base,
      paletteId: CUSTOM_PALETTE_ID,
      customStops: [stop('#000000', 0), stop('#ffffff', 100)],
    };
    expect(paletteFor(options).colours).toEqual(['#000000', '#ffffff']);
  });

  it('keeps the stops available while a named ramp is selected', () => {
    // Selecting a named palette is how a custom one is undone. It would be a
    // poor undo if it also deleted the work.
    const options = { ...base, customStops: [stop('#000000', 0), stop('#ffffff', 100)] };
    expect(paletteFor(options).id).toBe('ember');
    expect(paletteFor({ ...options, paletteId: CUSTOM_PALETTE_ID }).colours).toHaveLength(2);
  });

  it('falls back rather than failing when the stops are unusable', () => {
    // A link claiming a custom palette and carrying one stop should still draw.
    const options = { ...base, paletteId: CUSTOM_PALETTE_ID, customStops: [stop('#000000', 0)] };
    expect(paletteFor(options).id).toBe('ember');
  });

  it('falls back when there are no stops at all', () => {
    expect(paletteFor({ ...base, paletteId: CUSTOM_PALETTE_ID }).id).toBe('ember');
  });
});

describe('stopsFromPalette', () => {
  it('seeds the editor from a ramp that already exists', () => {
    const seeded = stopsFromPalette(getPalette('ember'));
    expect(seeded).toHaveLength(8);
    expect(seeded[0]?.position).toBe(0);
    expect(seeded.at(-1)?.position).toBe(100);
    expect(new Set(seeded.map((entry) => entry.id)).size).toBe(8);
  });

  it('will not seed more stops than the editor allows', () => {
    const wide = { id: 'wide', name: 'Wide', colours: Array.from({ length: 40 }, () => '#123456') };
    expect(stopsFromPalette(wide).length).toBeLessThanOrEqual(MAX_STOPS);
  });
});

describe('parseStops', () => {
  it('reads what was stored', () => {
    const parsed = parseStops([
      { colour: '#000000', position: 0 },
      { colour: '#FFFFFF', position: 100 },
    ]);
    expect(parsed?.map((entry) => entry.colour)).toEqual(['#000000', '#ffffff']);
  });

  it('gives every stop a fresh id', () => {
    // An id from outside would let a link decide which control has focus.
    const parsed = parseStops([
      { id: 'injected', colour: '#000000', position: 0 },
      { id: 'injected', colour: '#ffffff', position: 100 },
    ]);
    expect(parsed?.map((entry) => entry.id)).not.toContain('injected');
    expect(new Set(parsed?.map((entry) => entry.id)).size).toBe(2);
  });

  it('refuses a set it cannot read in full', () => {
    /*
     * Null rather than the stops it managed. A palette missing one stop is not a
     * smaller palette, it is a different one, and drawing it would misrepresent
     * what somebody shared.
     */
    for (const value of [
      undefined,
      null,
      'stops',
      [],
      [{ colour: '#000000', position: 0 }],
      [
        { colour: 'nonsense', position: 0 },
        { colour: '#ffffff', position: 100 },
      ],
      [
        { colour: '#000000', position: -1 },
        { colour: '#ffffff', position: 100 },
      ],
      [
        { colour: '#000000', position: 101 },
        { colour: '#ffffff', position: 100 },
      ],
      [{ colour: '#000000' }, { colour: '#ffffff', position: 100 }],
      Array.from({ length: MAX_STOPS + 1 }, () => ({ colour: '#000000', position: 0 })),
    ]) {
      expect(parseStops(value)).toBeNull();
    }
  });
});

describe('the compact form a link carries', () => {
  const stops = [stop('#160f0a', 0), stop('#ff6a13', 50), stop('#fff1e4', 100)];

  it('round-trips', () => {
    const decoded = decodeStops(encodeStops(stops));
    expect(decoded?.map((entry) => [entry.colour, entry.position])).toEqual([
      ['#160f0a', 0],
      ['#ff6a13', 50],
      ['#fff1e4', 100],
    ]);
  });

  it('stays short enough for a URL', () => {
    const twelve = Array.from({ length: MAX_STOPS }, (_unused, index) =>
      stop('#ff6a13', Math.round((100 * index) / (MAX_STOPS - 1))),
    );
    expect(encodeStops(twelve).length).toBeLessThan(140);
  });

  it('keeps a fractional position', () => {
    // The separator cannot be a full stop, because a position contains one.
    expect(decodeStops(encodeStops([stop('#000000', 12.5), stop('#ffffff', 100)]))?.[0]?.position).toBe(12.5);
  });

  it('refuses anything it cannot read', () => {
    for (const value of ['', 'x', '0-gggggg_100-ffffff', '0-000000', '200-000000_100-ffffff', 42, null]) {
      expect(decodeStops(value)).toBeNull();
    }
  });
});

describe('stopsAreUsable', () => {
  it('needs at least two and at most twelve', () => {
    expect(stopsAreUsable(undefined)).toBe(false);
    expect(stopsAreUsable([stop('#000000', 0)])).toBe(false);
    expect(stopsAreUsable([stop('#000000', 0), stop('#ffffff', 100)])).toBe(true);
    expect(stopsAreUsable(Array.from({ length: MAX_STOPS + 1 }, () => stop('#000000', 0)))).toBe(false);
  });
});

describe('the invert property', () => {
  const palette = paletteFromStops([stop('#000000', 0), stop('#ff0000', 10), stop('#ffffff', 100)]);
  const stats = matrixStats(fromNested([[0, 100]]));

  it('reads the ramp backwards at every point', () => {
    // The property, not a sample of it: inverted at t is the original at 1-t.
    const upright = createColourMapper(stats, { mode: 'continuous', palette });
    const inverted = createColourMapper(stats, { mode: 'continuous', palette, invert: true });

    for (let step = 0; step <= 20; step += 1) {
      const value = (100 * step) / 20;
      const mirrored = upright(100 - value);
      const actual = inverted(value);

      /*
       * Within one, not exactly equal. The property is exact in real arithmetic
       * and the blend rounds to whole bytes, so interpolating A to B at t and B
       * to A at 1-t can land either side of the same half.
       */
      for (const channel of ['r', 'g', 'b'] as const) {
        expect(
          Math.abs(actual[channel] - mirrored[channel]),
          `${channel} at ${String(value)}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is its own inverse', () => {
    // Inverting twice has to give back exactly what was there, or the control
    // would drift the palette every time it was toggled.
    const once = paletteFromStops(
      normaliseStops(
        (palette.positions ?? []).map((position, index) => ({
          id: newStopId(),
          colour: palette.colours[index] as string,
          position: 100 - position * 100,
        })),
      ),
    );
    const twice = paletteFromStops(
      normaliseStops(
        (once.positions ?? []).map((position, index) => ({
          id: newStopId(),
          colour: once.colours[index] as string,
          position: 100 - position * 100,
        })),
      ),
    );

    expect(twice.colours).toEqual(palette.colours);
    expect(twice.positions).toEqual(palette.positions);
  });
});

describe('inverting a custom palette', () => {
  it('mirrors the positions as well as the colours', () => {
    /*
     * Reversing the colours alone would move every stop as well as recolouring
     * it: a stop a tenth along would end up a tenth along in the new order,
     * rather than a tenth from the end.
     */
    const matrix = fromNested([[0, 1]]);
    const palette = paletteFromStops([stop('#000000', 0), stop('#ff0000', 10), stop('#ffffff', 100)]);

    const upright = createColourMapper(matrixStats(matrix), { mode: 'continuous', palette });
    const inverted = createColourMapper(matrixStats(matrix), {
      mode: 'continuous',
      palette,
      invert: true,
    });

    // The colour a tenth from the start, upright, is the colour a tenth from
    // the end once inverted.
    expect(upright(0)).toEqual({ r: 0, g: 0, b: 0 });
    expect(inverted(1)).toEqual({ r: 0, g: 0, b: 0 });
    expect(inverted(0)).toEqual({ r: 255, g: 255, b: 255 });
  });
});
