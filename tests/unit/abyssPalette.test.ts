/**
 * Abyss, and why its ramp runs the wrong way round.
 *
 * Every other palette runs dark to light. Abyss ends at pure black, because an
 * escape count is mapped by position and the top of the range is where points
 * that never escaped land — a void in the traditional rendering, not a
 * highlight. Putting black last achieves that through the ordinary mapping,
 * with no interior colour of its own and nothing specific to one artwork.
 *
 * That inversion is what these tests guard. It has three consequences worth
 * pinning: the ceiling must actually come out black in the modes that map it to
 * the ramp's end, the opening colour must stay legible against black or the
 * "reached the limit or not" mode becomes black on black, and the descent to the
 * void must not pass through grey.
 */

import { describe, expect, it } from 'vitest';
import { AA_LARGE, contrastRatio } from '../../scripts/lib/contrast';
import { fromNested } from '@/matrix/matrixTypes';
import { matrixStats } from '@/matrix/matrixStats';
import { COLOURING_MODES, DEFAULT_COLOURING, createEscapeMapper } from '@/renderer/escapeColouring';
import { animatePalette } from '@/renderer/paletteAnimation';
import { getPalette, paletteExists, palettes, type Palette } from '@/renderer/palettes';
import { renderArtwork } from '@/renderer/renderArtwork';
import { type Rgb } from '@/renderer/colourMapping';

const ITERATIONS = 28;
const RANGE = { min: 1, max: ITERATIONS };

const abyss = getPalette('abyss');

/** Local, because the renderer has no need to turn a colour back into text. */
function toHex({ r, g, b }: Rgb): string {
  const pair = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}

function mapper(mode: (typeof COLOURING_MODES)[number], palette: Palette = abyss) {
  return createEscapeMapper({
    palette,
    entries: palette.colours.length,
    colouring: { ...DEFAULT_COLOURING, mode },
    range: RANGE,
  });
}

describe('Abyss is an ordinary named palette', () => {
  it('is registered like any other', () => {
    expect(paletteExists('abyss')).toBe(true);
    expect(abyss.id).toBe('abyss');
    expect(abyss.name).toBe('Abyss');
    expect(palettes.some((palette) => palette.id === 'abyss')).toBe(true);
  });

  it('has the same number of entries as every other palette', () => {
    /*
     * Not cosmetic. The banded and threshold modes take their band count from
     * the entry count, so a palette with nine stops would divide the range
     * differently from every other and its bands would not line up with anyone
     * else's.
     */
    const counts = new Set(palettes.map((palette) => palette.colours.length));
    expect(counts.size).toBe(1);
    expect(abyss.colours).toHaveLength(8);
  });

  it('declares positions that are ascending and span the whole ramp', () => {
    const positions = abyss.positions ?? [];
    expect(positions).toHaveLength(abyss.colours.length);
    expect(positions[0]).toBe(0);
    expect(positions[positions.length - 1]).toBe(1);
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index] as number).toBeGreaterThan(positions[index - 1] as number);
    }
  });

  it('ends at pure black, exactly', () => {
    // Not near-black. The void should be the absence of colour, and any value
    // above zero would show as a tint against a dark screen.
    expect(abyss.colours[abyss.colours.length - 1]).toBe('#000000');
    expect(abyss.positions?.[abyss.colours.length - 1]).toBe(1);
  });

  it('opens on a blue that can be told apart from that black', () => {
    /*
     * The requirement the inversion creates. "Reached the limit or not" shows
     * only the two ends of the ramp, so if the first colour were also
     * near-black — the conventional choice — the mode would render the set
     * invisibly against its own surroundings.
     */
    const first = abyss.colours[0] as string;
    expect(contrastRatio(first, '#000000')).toBeGreaterThan(AA_LARGE);
  });
});

describe('the iteration ceiling', () => {
  const ceilingModes = ['smooth', 'bands', 'threshold', 'insideOutside'] as const;

  it.each(ceilingModes)('is black under %s', (mode) => {
    expect(toHex(mapper(mode)(ITERATIONS))).toBe('#000000');
  });

  it('is not black under repeating, because that mode cycles by design', () => {
    /*
     * Recorded rather than treated as a fault. Repeating bands walk the ramp
     * every `bandWidth` values and never single out the ceiling, which is true
     * of every palette — Heat's interior is yellow there too. The alternative
     * would be a ceiling special case, which is exactly the artwork-specific
     * interior colour this palette exists to avoid.
     */
    expect(toHex(mapper('repeating')(ITERATIONS))).not.toBe('#000000');
  });

  it('takes the exterior with it: the lowest value is the opening blue', () => {
    expect(toHex(mapper('smooth')(RANGE.min))).toBe(abyss.colours[0]);
    expect(toHex(mapper('insideOutside')(RANGE.min))).toBe(abyss.colours[0]);
  });
});

describe('a view entirely at the ceiling', () => {
  const uniform = fromNested(Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ITERATIONS)));

  it.each(COLOURING_MODES)('stays one flat colour under %s', (mode) => {
    // The property that must hold whatever the palette: one value cannot be
    // made to look like detail.
    const image = renderArtwork(uniform, matrixStats(uniform), {
      mode: 'continuous',
      palette: abyss,
      escape: { colouring: { ...DEFAULT_COLOURING, mode }, range: RANGE, entries: abyss.colours.length },
    });

    const first = [image.data[0], image.data[1], image.data[2], image.data[3]];
    for (let at = 0; at < image.data.length; at += 4) {
      expect([image.data[at], image.data[at + 1], image.data[at + 2], image.data[at + 3]]).toEqual(first);
    }
  });

  it('is black under the modes that map the ceiling to the ramp’s end', () => {
    for (const mode of ['smooth', 'bands', 'threshold', 'insideOutside'] as const) {
      const image = renderArtwork(uniform, matrixStats(uniform), {
        mode: 'continuous',
        palette: abyss,
        escape: { colouring: { ...DEFAULT_COLOURING, mode }, range: RANGE, entries: abyss.colours.length },
      });
      expect([image.data[0], image.data[1], image.data[2]], mode).toEqual([0, 0, 0]);
    }
  });
});

describe('the descent into the void', () => {
  it('passes through navy rather than grey', () => {
    /*
     * The reason for the dark-navy stop before black. Interpolating the pale
     * highlight straight to black passes through a desaturated grey, which
     * renders as a dirty rim just inside the boundary — visible, and the one
     * thing that made the simpler ramps look wrong.
     *
     * Stated as a property of the colours rather than of one chosen ramp: from
     * the highlight to the void, anything not already nearly black keeps a blue
     * cast.
     */
    const at = mapper('smooth');
    for (let value = 24; value <= ITERATIONS; value += 0.25) {
      const { r, g, b } = at(value);
      if (Math.max(r, g, b) <= 24) continue;
      expect(b, `value ${String(value)} is grey: ${toHex({ r, g, b })}`).toBeGreaterThan(r + 15);
      expect(b).toBeGreaterThanOrEqual(g);
    }
  });

  it('reaches its pale highlight before the end, not at it', () => {
    // A highlight at position 1 would be the ceiling, and the ceiling is the
    // void. It belongs to the high escape counts just outside the set.
    const at = mapper('smooth');
    const brightest = Array.from({ length: 200 }, (_unused, step) => {
      const value = RANGE.min + (step / 199) * (RANGE.max - RANGE.min);
      const { r, g, b } = at(value);
      return { value, luminance: r + g + b };
    }).reduce((best, sample) => (sample.luminance > best.luminance ? sample : best));

    expect(brightest.value).toBeGreaterThan(24);
    expect(brightest.value).toBeLessThan(ITERATIONS);
  });
});

describe('animation', () => {
  it('moves the colours and puts them back exactly', () => {
    /*
     * The interior is not required to stay black while an animation runs —
     * moving the ramp is the point of it. What must hold is that stopping
     * returns the palette it started from, since that is what pausing and
     * resetting rely on.
     */
    for (const mode of ['rotate', 'pingPong', 'shift'] as const) {
      const moved = animatePalette(abyss, mode, 0.37);

      // Compared as a ramp, not as a list of colours: rotate and ping-pong
      // reorder the stops and add a seam colour, while shift slides the same
      // stops to new positions. Either is movement.
      expect([moved.colours, moved.positions], mode).not.toEqual([abyss.colours, abyss.positions]);

      const back = animatePalette(abyss, mode, 0);
      expect(back.colours, mode).toEqual(abyss.colours);
      expect(back.positions, mode).toEqual(abyss.positions);
    }
  });

  it('keeps its declared positions rather than falling back to even spacing', () => {
    // A palette with positions that were dropped during animation would jump
    // the moment it started and jump back when it stopped.
    const moved = animatePalette(abyss, 'rotate', 0.25);
    expect(moved.positions).toBeDefined();
    expect((moved.positions ?? []).length).toBeGreaterThanOrEqual(abyss.colours.length);

    const positions = moved.positions ?? [];
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index] as number).toBeGreaterThanOrEqual(positions[index - 1] as number);
    }
  });
});
