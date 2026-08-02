/**
 * The palette animation model.
 *
 * All of it is a pure transform from a base palette and a phase to the palette
 * for one frame. The base is never touched — which is the property most of
 * these tests are really about, because pause, reset and export all depend on
 * it being exactly true rather than nearly.
 */

import { describe, expect, it } from 'vitest';
import { parseHexColour, sampleGradient } from '@/renderer/colourMapping';
import { newStopId, paletteFromStops } from '@/renderer/customPalette';
import { getPalette } from '@/renderer/palettes';
import { ANIMATION_MODES, animatePalette, phaseFor } from '@/renderer/paletteAnimation';

function stop(colour: string, position: number) {
  return { id: newStopId(), colour, position };
}

const BASE = paletteFromStops([stop('#000000', 0), stop('#ff0000', 40), stop('#ffffff', 100)]);

/** What the ramp shows at a point, which is the only thing that is really seen. */
function colourAt(palette: { colours: readonly string[]; positions?: readonly number[] }, at: number) {
  return sampleGradient(palette.colours.map(parseHexColour), at, palette.positions);
}

describe('phaseFor', () => {
  it('is elapsed time, not frames', () => {
    // A second at one cycle per second is one whole cycle, whatever the display
    // managed to draw in between.
    expect(phaseFor(0, 1)).toBe(0);
    expect(phaseFor(250, 1)).toBeCloseTo(0.25, 10);
    expect(phaseFor(1000, 1)).toBe(0);
    expect(phaseFor(1500, 1)).toBeCloseTo(0.5, 10);
  });

  it('scales with speed', () => {
    expect(phaseFor(1000, 0.25)).toBeCloseTo(0.25, 10);
    expect(phaseFor(4000, 0.25)).toBe(0);
  });

  it('gives nothing rather than NaN for a nonsense clock', () => {
    expect(phaseFor(Number.NaN, 1)).toBe(0);
    expect(phaseFor(1000, 0)).toBe(0);
    expect(phaseFor(1000, -1)).toBe(0);
  });
});

describe('animatePalette', () => {
  it('gives back the base itself at rest', () => {
    // Identical, not merely equivalent: pausing and resetting depend on it.
    for (const mode of ANIMATION_MODES) expect(animatePalette(BASE, mode, 0)).toBe(BASE);
  });

  it('never alters the base', () => {
    const before = JSON.stringify(BASE);
    for (const mode of ANIMATION_MODES) {
      for (const phase of [0.1, 0.4, 0.75, 0.99]) animatePalette(BASE, mode, phase);
    }
    expect(JSON.stringify(BASE)).toBe(before);
  });

  it('works on a named ramp, which declares no positions', () => {
    const animated = animatePalette(getPalette('ember'), 'rotate', 0.25);
    expect(animated.colours.length).toBeGreaterThan(0);
    expect(animated.positions).toBeDefined();
  });

  for (const mode of ANIMATION_MODES) {
    it(`keeps ${mode} positions ordered and inside the ramp`, () => {
      for (const phase of [0.05, 0.2, 0.5, 0.8, 0.95]) {
        const animated = animatePalette(BASE, mode, phase);
        const positions = animated.positions ?? [];

        expect(positions).toHaveLength(animated.colours.length);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        expect(Math.min(...positions)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...positions)).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe('rotate', () => {
  it('moves the ramp cyclically', () => {
    // The colour at the middle after a quarter turn is the colour a quarter
    // earlier before it.
    const animated = animatePalette(BASE, 'rotate', 0.25);
    expect(colourAt(animated, 0.5)).toEqual(colourAt(BASE, 0.25));
  });

  it('meets itself at the seam', () => {
    // Both ends carry the same colour, so the ramp closes into a loop rather
    // than stretching whichever stop happens to be nearest across the join.
    const animated = animatePalette(BASE, 'rotate', 0.3);
    expect(colourAt(animated, 0)).toEqual(colourAt(animated, 1));
  });

  it('comes back to where it started after a whole cycle', () => {
    const nearly = animatePalette(BASE, 'rotate', 0.999);
    // Approaching one from below is approaching the base from the other side.
    expect(colourAt(nearly, 0.5).r).toBeCloseTo(colourAt(BASE, 0.5).r, 0);
  });
});

describe('ping-pong', () => {
  it('turns round at the limits rather than jumping', () => {
    /*
     * The offset follows a triangle, so the two halves of the cycle mirror each
     * other. Sampled either side of the turn, the ramp is in nearly the same
     * place — which is what "no discontinuous jump" means when measured.
     */
    const before = colourAt(animatePalette(BASE, 'pingPong', 0.49), 0.5);
    const after = colourAt(animatePalette(BASE, 'pingPong', 0.51), 0.5);
    expect(Math.abs(after.r - before.r)).toBeLessThan(12);
    expect(Math.abs(after.g - before.g)).toBeLessThan(12);
    expect(Math.abs(after.b - before.b)).toBeLessThan(12);
  });

  it('is in the same place at both ends of a cycle', () => {
    expect(animatePalette(BASE, 'pingPong', 0.999).positions?.[1]).toBeCloseTo(
      animatePalette(BASE, 'pingPong', 0.001).positions?.[1] ?? -1,
      2,
    );
  });
});

describe('shift', () => {
  it('slides the stops without wrapping', () => {
    const animated = animatePalette(BASE, 'shift', 0.25);
    // Still three stops: nothing is added, because there is no seam to close.
    expect(animated.colours).toHaveLength(3);
  });

  it('holds the stops inside the ramp as they reach an end', () => {
    for (const phase of [0.2, 0.25, 0.3, 0.7, 0.75, 0.8]) {
      const positions = animatePalette(BASE, 'shift', phase).positions ?? [];
      expect(Math.min(...positions)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...positions)).toBeLessThanOrEqual(1);
    }
  });
});

describe('hard edges', () => {
  const edged = paletteFromStops([
    stop('#000000', 0),
    stop('#ff0000', 50),
    stop('#00ff00', 50),
    stop('#ffffff', 100),
  ]);

  for (const mode of ANIMATION_MODES) {
    it(`stays hard under ${mode}`, () => {
      /*
       * The thing a resampling implementation would have quietly destroyed.
       * Both stops move by the same amount, so they still share a position —
       * and the ramp still steps rather than fading across it.
       */
      for (const phase of [0.1, 0.35, 0.6, 0.9]) {
        const animated = animatePalette(edged, mode, phase);
        const positions = animated.positions ?? [];

        const shared = positions.filter((position, index) => positions.indexOf(position) !== index).length;
        expect(shared, `at phase ${String(phase)}`).toBeGreaterThanOrEqual(1);
      }
    });
  }

  it('still steps across the edge rather than blending through it', () => {
    const animated = animatePalette(edged, 'rotate', 0.2);
    const positions = animated.positions ?? [];
    const at = positions.find((position, index) => positions.indexOf(position) !== index);
    expect(at).toBeDefined();

    // A hair either side of the shared position gives two different colours.
    const before = colourAt(animated, (at as number) - 0.001);
    const after = colourAt(animated, (at as number) + 0.001);
    expect(before).not.toEqual(after);
  });
});
