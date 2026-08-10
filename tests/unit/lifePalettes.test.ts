/**
 * Classic, and the one thing that makes it Classic.
 *
 * The traditional look is not a colour scheme so much as the absence of one: a
 * living cell is white whether it was born this generation or has been sitting
 * there for a thousand. These check that the palette says so, and — more
 * usefully — that the shade the renderer picks really is the same at every age,
 * because that is the behaviour anybody would notice if it broke.
 */

import { describe, expect, it } from 'vitest';
import { MAX_AGE } from '@/life/lifeEngine';
import { accentRampFor, CLASSIC, lifePalette, LIFE_PALETTES } from '@/life/lifePalettes';
import { getPalette, palettes, type Palette } from '@/renderer/palettes';

/**
 * The colour `LifePage` draws a cell of this age in.
 *
 * A copy of the renderer's one line, and deliberately a copy: the point is to
 * check the arithmetic against the ramp, and a test that imported the component
 * would be checking a canvas that jsdom cannot draw.
 */
function shadeFor(palette: Palette, age: number): string {
  const ramp = palette.colours;
  const brightest = ramp.length - 1;
  const dimmest = Math.max(0, ramp.length - 6);
  return ramp[Math.max(dimmest, brightest - age)] as string;
}

describe('Classic', () => {
  it('is offered alongside the others', () => {
    const names = LIFE_PALETTES.map((palette) => palette.name);

    expect(names).toContain('Classic');
    // Sunset is what the page opens on, so it leads; Classic is the other
    // obvious answer to what Life should look like, so it follows.
    expect(names.slice(0, 2)).toEqual(['Sunset', 'Classic']);
  });

  it('is black behind white', () => {
    expect(CLASSIC.background).toBe('#000000');
    expect(CLASSIC.colours).toEqual(['#ffffff']);
  });

  it('draws every living cell the same white, whatever its age', () => {
    /*
     * The rule the palette exists to express. Ages still happen — the engine
     * keeps counting them and `ages` still fills — but this ramp has one entry,
     * so the shade cannot vary with them.
     */
    const shades = new Set<string>();
    for (let age = 0; age <= MAX_AGE; age += 1) shades.add(shadeFor(CLASSIC, age));

    expect([...shades]).toEqual(['#ffffff']);
  });

  it('leaves the age colouring of every other palette alone', () => {
    // The counterpart, so the test above cannot pass by the shading having been
    // removed for everybody.
    for (const palette of LIFE_PALETTES.filter((candidate) => candidate.id !== CLASSIC.id)) {
      const fresh = shadeFor(palette, 0);
      const old = shadeFor(palette, 6);
      expect(fresh, palette.name).not.toBe(old);
    }
  });

  it('is resolved by name here, and unknown to the shared registry', () => {
    /*
     * Deliberately not in `renderer/palettes`. A ramp of one colour suits a
     * world of living and dead cells and would be useless to an artwork with a
     * hundred values to tell apart, so it is not offered to any other palette
     * control in the application.
     */
    expect(lifePalette(CLASSIC.id)).toBe(CLASSIC);
    expect(palettes.some((palette) => palette.id === CLASSIC.id)).toBe(false);
    expect(getPalette(CLASSIC.id).id).not.toBe(CLASSIC.id);
  });

  it('lends the interface no colour, where the others do', () => {
    // One white is not an accent. The interface keeps APL Art's own colour
    // rather than deriving a hue that is not there.
    expect(accentRampFor(CLASSIC)).toBeNull();
    expect(accentRampFor(lifePalette('sunset'))).not.toBeNull();
  });
});

describe('the palettes this page offers', () => {
  it('opens on Sunset', () => {
    expect(LIFE_PALETTES[0]?.id).toBe('sunset');
  });

  it('resolves every one of them to a real ramp', () => {
    for (const palette of LIFE_PALETTES) {
      expect(palette.colours.length, palette.name).toBeGreaterThan(0);
      expect(palette.background, palette.name).toBeDefined();
      expect(lifePalette(palette.id), palette.name).toBe(palette);
    }
  });
});
