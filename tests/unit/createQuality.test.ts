/**
 * What the curated Create controls refuse to produce.
 *
 * These are about the picture rather than about the program. Every combination
 * asserted here is a legal artwork that runs and returns a matrix; what makes it
 * unacceptable is that the matrix holds one or two distinct values, so the
 * "artwork" is a flat square or a checkerboard of nothing. Advanced and the
 * editor still reach all of them, which is the point of the distinction.
 */

import { describe, expect, it } from 'vitest';
import { checkerShiftQuality } from '@/presets/checker-shift';
import { gcd, nearestAccepted } from '@/presets/createQuality';
import { modularBloomQuality, shadesDrawn } from '@/presets/modular-bloom';
import { waveInterferenceQuality } from '@/presets/wave-interference';

const values = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('gcd', () => {
  it('is the greatest common divisor, whatever order or sign it is given', () => {
    expect(gcd(10, 20)).toBe(10);
    expect(gcd(20, 10)).toBe(10);
    expect(gcd(11, 23)).toBe(1);
    expect(gcd(-6, 9)).toBe(3);
    expect(gcd(7, 0)).toBe(7);
  });
});

describe('nearestAccepted', () => {
  it('leaves a value that already passes exactly where it is', () => {
    expect(nearestAccepted(5, 1, 10, () => true)).toBe(5);
  });

  it('takes the nearest passing value, preferring the larger when two are equally close', () => {
    expect(nearestAccepted(5, 1, 10, (candidate) => candidate === 4 || candidate === 6)).toBe(6);
    expect(nearestAccepted(5, 1, 10, (candidate) => candidate === 4)).toBe(4);
  });

  it('answers null rather than inventing one when nothing in range passes', () => {
    expect(nearestAccepted(5, 1, 10, () => false)).toBeNull();
  });
});

describe('Modular Bloom shades', () => {
  it('counts the distinct values the artwork can draw', () => {
    // `modulus | multiplier × table` takes the multiples of the gcd below the
    // modulus, so this is arithmetic rather than a measurement of an image.
    expect(shadesDrawn(10, 20)).toBe(2);
    expect(shadesDrawn(5, 5)).toBe(1);
    expect(shadesDrawn(1, 19)).toBe(19);
    expect(shadesDrawn(11, 23)).toBe(23);
  });
});

describe('the Modular Bloom quality rule', () => {
  it('rescues the reported collapse: Complexity 10 against Scale 20', () => {
    const result = modularBloomQuality(values({ multiplier: 10, modulus: 20, size: 56 }));

    const multiplier = result.get('multiplier') as number;
    const modulus = result.get('modulus') as number;
    expect(shadesDrawn(multiplier, modulus)).toBeGreaterThanOrEqual(5);
  });

  it('leaves a combination that is already worth drawing exactly alone', () => {
    const before = values({ multiplier: 7, modulus: 23, size: 64 });
    expect(modularBloomQuality(before)).toBe(before);
  });

  it('never moves the control being held', () => {
    const held = modularBloomQuality(values({ multiplier: 10, modulus: 20, size: 56 }), 'modulus');
    expect(held.get('modulus')).toBe(20);
    expect(shadesDrawn(held.get('multiplier') as number, 20)).toBeGreaterThanOrEqual(5);

    const other = modularBloomQuality(values({ multiplier: 10, modulus: 20, size: 56 }), 'multiplier');
    expect(other.get('multiplier')).toBe(10);
    expect(shadesDrawn(10, other.get('modulus') as number)).toBeGreaterThanOrEqual(5);
  });

  it('moves as little as it can', () => {
    // Scale 20 is one step from 19, which is prime and therefore coprime to
    // everything the Complexity slider can hold.
    const result = modularBloomQuality(values({ multiplier: 10, modulus: 20, size: 56 }), 'multiplier');
    expect(result.get('modulus')).toBe(21);
  });

  it('leaves nothing degenerate anywhere in the space the two sliders reach', () => {
    const bad: string[] = [];

    for (let multiplier = 1; multiplier <= 11; multiplier += 1) {
      for (let modulus = 5; modulus <= 24; modulus += 1) {
        for (const holding of [undefined, 'multiplier', 'modulus'] as const) {
          const result = modularBloomQuality(values({ multiplier, modulus, size: 56 }), holding);
          const shades = shadesDrawn(result.get('multiplier') as number, result.get('modulus') as number);
          if (shades < 5) bad.push(`${String(multiplier)}/${String(modulus)} holding ${String(holding)}`);
        }
      }
    }

    expect(bad).toEqual([]);
  });

  it('is idempotent, so applying it twice is applying it once', () => {
    for (let multiplier = 1; multiplier <= 11; multiplier += 1) {
      for (let modulus = 5; modulus <= 24; modulus += 1) {
        const once = modularBloomQuality(values({ multiplier, modulus, size: 56 }));
        const twice = modularBloomQuality(once);
        expect([...twice]).toEqual([...once]);
      }
    }
  });
});

describe('the Checker Shift quality rule', () => {
  it('rescues a shear that lands back where it started', () => {
    // Offset 8 against a repeat of 8 pushes each column exactly one full cycle,
    // which draws the same horizontal stripes as no offset at all.
    const result = checkerShiftQuality(values({ repeat: 8, offset: 8, size: 32 }));
    const repeat = result.get('repeat') as number;
    const offset = result.get('offset') as number;
    expect(offset % repeat).not.toBe(0);
  });

  it('leaves a real weave alone', () => {
    const before = values({ repeat: 8, offset: 3, size: 32 });
    expect(checkerShiftQuality(before)).toBe(before);
  });

  it('never moves the control being held, either way round', () => {
    const holdingRepeat = checkerShiftQuality(values({ repeat: 4, offset: 8, size: 32 }), 'repeat');
    expect(holdingRepeat.get('repeat')).toBe(4);
    expect((holdingRepeat.get('offset') as number) % 4).not.toBe(0);

    const holdingOffset = checkerShiftQuality(values({ repeat: 4, offset: 8, size: 32 }), 'offset');
    expect(holdingOffset.get('offset')).toBe(8);
    expect(8 % (holdingOffset.get('repeat') as number)).not.toBe(0);
  });

  it('leaves no invisible shear anywhere the two sliders reach', () => {
    for (let repeat = 2; repeat <= 12; repeat += 1) {
      for (let offset = 1; offset <= 8; offset += 1) {
        for (const holding of [undefined, 'repeat', 'offset'] as const) {
          const result = checkerShiftQuality(values({ repeat, offset, size: 32 }), holding);
          const after = (result.get('offset') as number) % (result.get('repeat') as number);
          expect(after).not.toBe(0);
        }
      }
    }
  });
});

describe('the Wave Interference quality rule', () => {
  it('gives a tight ripple enough cells to be drawn from', () => {
    const result = waveInterferenceQuality(values({ frequency: 14, size: 32, symmetry: 5 }));
    const frequency = result.get('frequency') as number;
    const size = result.get('size') as number;
    expect(size).toBeGreaterThanOrEqual(frequency * 5);
  });

  it('lowers the ripples when the grid is the control being held', () => {
    const result = waveInterferenceQuality(values({ frequency: 14, size: 32, symmetry: 5 }), 'size');
    expect(result.get('size')).toBe(32);
    expect(result.get('frequency')).toBe(6);
  });

  it('raises the grid when the ripples are the control being held', () => {
    const result = waveInterferenceQuality(values({ frequency: 14, size: 32, symmetry: 5 }), 'frequency');
    expect(result.get('frequency')).toBe(14);
    expect(result.get('size')).toBe(70);
  });

  it('leaves nothing under-sampled anywhere the two sliders reach', () => {
    for (let frequency = 3; frequency <= 14; frequency += 1) {
      for (let size = 32; size <= 80; size += 1) {
        for (const holding of [undefined, 'frequency', 'size'] as const) {
          const result = waveInterferenceQuality(values({ frequency, size, symmetry: 5 }), holding);
          const after = result.get('size') as number;
          expect(after).toBeGreaterThanOrEqual((result.get('frequency') as number) * 5);
        }
      }
    }
  });
});
