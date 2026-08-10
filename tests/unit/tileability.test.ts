/**
 * Whether an artwork tiles, decided from its own numbers.
 *
 * These are about the arithmetic rather than the interface, and they are the
 * reason the interface is allowed to make a claim at all. Every period here was
 * derived from the artwork's APL and is asserted against the artwork's own
 * declaration, so a preset whose mathematics is restated wrongly fails rather
 * than quietly mislabelling itself.
 *
 * No execution service is involved: periodicity is a property of the expression,
 * not of a result, so nothing here needs a matrix and nothing needs TryAPL.
 */

import { describe, expect, it } from 'vitest';
import { setParameterValues } from '@/editor/parameterBinding';
import { basketWeave } from '@/presets/basket-weave';
import { checkerShift } from '@/presets/checker-shift';
import { glowGrid } from '@/presets/glow-grid';
import { mazeTiles } from '@/presets/maze-tiles';
import { modularBloom } from '@/presets/modular-bloom';
import { quiltStars } from '@/presets/quilt-stars';
import { truchetGrid } from '@/presets/truchet-grid';
import { waveInterference } from '@/presets/wave-interference';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { presets } from '@/presets/presets';
import { tileVerdict } from '@/presets/tileability';
import { type ArtworkPreset } from '@/presets/schema';

/** The preset's own code with some numbers written over it. */
function withValues(preset: ArtworkPreset, values: Record<string, number>): string {
  return setParameterValues(preset.code, new Map(Object.entries(values)));
}

const verdictOf = (preset: ArtworkPreset, values: Record<string, number>) =>
  tileVerdict(preset, withValues(preset, values));

/** Applies a correction the way the workspace will, and asks again. */
function afterCorrection(preset: ArtworkPreset, values: Record<string, number>) {
  const code = withValues(preset, values);
  const first = tileVerdict(preset, code);
  const correction = first?.correction;
  if (correction === null || correction === undefined) return { first, corrected: null, code };

  const nextCode = setParameterValues(code, correction);
  return { first, corrected: tileVerdict(preset, nextCode), code: nextCode };
}

describe('which artworks answer the question at all', () => {
  it('is exactly the seven that repeat, and no fractal', () => {
    const offering = presets.filter((preset) => preset.tiling !== undefined).map((preset) => preset.id);

    expect(new Set(offering)).toEqual(
      new Set([
        'basket-weave',
        'quilt-stars',
        'maze-tiles',
        'glow-grid',
        'truchet-grid',
        'checker-shift',
        'modular-bloom',
      ]),
    );
  });

  it('says nothing at all about an artwork that does not repeat', () => {
    /*
     * Wave Interference is the important absence. Its waves travel at angles of
     * `πk ÷ symmetry`, so the wave numbers include irrational multiples — √3⁄2 at
     * three directions, √2⁄2 at four — and no whole number of ripples ever brings
     * one back to where it started. There is no nearby seamless state to offer,
     * so it is offered no tab rather than a dead one.
     */
    expect(waveInterference.tiling).toBeUndefined();
    expect(tileVerdict(waveInterference, waveInterference.code)).toBeNull();
    expect(tileVerdict(mandelbrotField, mandelbrotField.code)).toBeNull();
  });
});

describe('the verdict follows the numbers, not the preset', () => {
  /*
   * The distinction the whole module exists for. Each of these artworks is
   * periodic *as a program*; whether it tiles depends entirely on what it is
   * holding, and Advanced can write anything.
   */
  const cases: readonly [ArtworkPreset, string, Record<string, number>, Record<string, number>][] = [
    // preset, period description, a state that tiles, a state that does not
    [basketWeave, 'two strap widths', { size: 96, width: 12 }, { size: 100, width: 12 }],
    [quiltStars, 'one block', { size: 96, block: 24 }, { size: 100, block: 24 }],
    [mazeTiles, 'one cell', { size: 96, cell: 8 }, { size: 98, cell: 8 }],
    [glowGrid, 'three spacings', { size: 108, spacing: 18 }, { size: 100, spacing: 18 }],
  ];

  for (const [preset, period, tiles, seams] of cases) {
    it(`${preset.title} repeats every ${period}`, () => {
      expect(verdictOf(preset, tiles)?.state, 'a whole number of periods').toBe('seamless');
      expect(verdictOf(preset, seams)?.state, 'not a whole number of periods').toBe('correctable');
    });
  }

  it('Checker Shift tiles when the grid is a whole number of bands', () => {
    // (row + shear × column) mod bands: period is the band count on both axes.
    expect(verdictOf(checkerShift, { size: 32, repeat: 8, offset: 3 })?.state).toBe('seamless');
    expect(verdictOf(checkerShift, { size: 30, repeat: 8, offset: 3 })?.state).toBe('correctable');
  });

  it('Checker Shift will not call plain stripes seamless', () => {
    /*
     * A shear that is a multiple of the band count is exactly periodic and is
     * also no longer a weave. Arithmetically fine, and not the artwork somebody
     * was looking at, so it is not offered as an answer.
     */
    expect(verdictOf(checkerShift, { size: 32, repeat: 8, offset: 8 })?.state).not.toBe('seamless');
  });

  it('Modular Bloom repeats every scale ÷ gcd(complexity, scale)', () => {
    // 17 is prime and the complexity shares no factor, so the period is 17.
    expect(verdictOf(modularBloom, { size: 68, modulus: 17, multiplier: 1 })?.state).toBe('seamless');
    expect(verdictOf(modularBloom, { size: 64, modulus: 17, multiplier: 1 })?.state).toBe('correctable');

    // A shared factor shortens the period: 18 ÷ gcd(6, 18) = 3, and 64 is not a
    // multiple of 3 — but 66 is, which is what makes this correctable at all.
    expect(verdictOf(modularBloom, { size: 66, modulus: 18, multiplier: 6 })?.state).toBe('seamless');
  });

  it('Truchet is about its shapes rather than its grid', () => {
    // No periodicity anywhere: the classes come from a hash. It joins because
    // every arc crosses an edge at the midpoint, and diagonals do not.
    expect(verdictOf(truchetGrid, { classes: 2 })?.state).toBe('seamless');
    expect(verdictOf(truchetGrid, { classes: 1 })?.state).toBe('seamless');
    expect(verdictOf(truchetGrid, { classes: 3 })?.state).toBe('correctable');
    expect(verdictOf(truchetGrid, { classes: 4 })?.state).toBe('correctable');
  });
});

describe('the correction', () => {
  it('moves the grid rather than the pattern, wherever it can', () => {
    /*
     * The preference that matters. Every other number in these artworks shapes
     * the motif — a strap's width, a block's size — so moving one hands back a
     * different picture, while a nearby grid is the same picture at a slightly
     * different extent.
     */
    const { first } = afterCorrection(basketWeave, { size: 100, width: 12 });
    expect([...(first?.correction ?? new Map())]).toEqual([['size', 96]]);
    expect(first?.correctionLabel).toBe('Auto tile');
  });

  it('produces a state that actually tiles', () => {
    const states: readonly [ArtworkPreset, Record<string, number>][] = [
      [basketWeave, { size: 100, width: 12 }],
      [quiltStars, { size: 100, block: 24 }],
      [mazeTiles, { size: 98, cell: 8 }],
      [glowGrid, { size: 100, spacing: 18 }],
      [checkerShift, { size: 30, repeat: 8, offset: 3 }],
      [modularBloom, { size: 64, modulus: 17, multiplier: 1 }],
      [truchetGrid, { classes: 4 }],
    ];

    for (const [preset, values] of states) {
      const { corrected } = afterCorrection(preset, values);
      expect(corrected?.state, preset.title).toBe('seamless');
    }
  });

  it('changes nothing when the artwork already tiles', () => {
    // Idempotence, which is what makes the button safe to press twice.
    for (const [preset, values] of [
      [basketWeave, { size: 96, width: 12 }],
      [checkerShift, { size: 32, repeat: 8, offset: 3 }],
      [truchetGrid, { classes: 2 }],
    ] as const) {
      const verdict = verdictOf(preset, values);
      expect(verdict?.state, preset.title).toBe('seamless');
      expect(verdict?.correction, preset.title).toBeNull();
    }
  });

  it('is idempotent when applied to its own output', () => {
    const once = afterCorrection(checkerShift, { size: 30, repeat: 8, offset: 3 });
    expect(once.corrected?.state).toBe('seamless');
    expect(once.corrected?.correction).toBeNull();

    // And applying it again is a no-op rather than a second adjustment.
    const twice = tileVerdict(checkerShift, once.code);
    expect(twice?.state).toBe('seamless');
    expect(twice?.correction).toBeNull();
  });

  it('does not drag the grid a long way to make a label go green', () => {
    /*
     * Bounded on purpose. A correction is meant to be the artwork somebody
     * chose, drawn slightly differently — not a different picture wearing a
     * reassuring label. Whatever it moves, it stays near where it started.
     */
    const { first } = afterCorrection(basketWeave, { size: 100, width: 12 });
    const size = first?.correction?.get('size');
    expect(size).toBeDefined();
    expect(Math.abs((size ?? 0) - 100)).toBeLessThanOrEqual(24);
  });

  it("names Truchet's correction as the deliberate change it is", () => {
    const verdict = verdictOf(truchetGrid, { classes: 4 });

    // Not "Auto tile": dropping the diagonals changes the artwork's character,
    // so it says what it will do rather than presenting itself as a small snap.
    expect(verdict?.correctionLabel).toBe('Use 2 tile shapes');
    expect([...(verdict?.correction ?? new Map())]).toEqual([['classes', 2]]);
  });
});

describe('what the renderer must never be allowed to claim', () => {
  it('takes no notice of how copies are composed on screen', () => {
    /*
     * Repeat and Mirror repeat are ways of looking at a finished tile. Mirror
     * repeat in particular makes a join vanish by reflecting one side onto the
     * other, which is precisely why the verdict is computed from the source and
     * has no access to the render options at all.
     *
     * Asserted as a property of the signature: `tileVerdict` takes a preset and
     * its code, and there is nowhere for a tiling mode to enter.
     */
    const seams = withValues(basketWeave, { size: 100, width: 12 });
    expect(tileVerdict(basketWeave, seams)?.state).toBe('correctable');
    expect(tileVerdict.length).toBe(2);
  });
});
