/**
 * The colour model the accent derivation adjusts colours in.
 *
 * Tested on its own because everything above it trusts three properties: a
 * round trip does not move a colour, changing lightness does not change hue, and
 * whatever comes out is a colour a browser can paint. Each is checked
 * numerically rather than by eye.
 */

import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex } from '@/theme/contrast';
import { deltaEok, hexToOklch, oklchToHex, withChroma, withLightness } from '@/theme/oklch';

const SAMPLES = [
  '#000000',
  '#ffffff',
  '#ff6a13',
  '#199b9d',
  '#1d5fa8',
  '#8d8d8d',
  '#fff1e4',
  '#160f0a',
  '#d926c9',
  '#74ad4c',
];

describe('hexToOklch and oklchToHex', () => {
  it('round-trips every sample within one 8-bit step', () => {
    for (const hex of SAMPLES) {
      const back = oklchToHex(hexToOklch(hex));
      const original = parseHex(hex);
      const returned = parseHex(back);

      for (const channel of ['r', 'g', 'b'] as const) {
        expect(Math.abs(original[channel] - returned[channel])).toBeLessThanOrEqual(1);
      }
    }
  });

  it('puts black and white exactly where they belong', () => {
    expect(hexToOklch('#000000').l).toBeCloseTo(0, 5);
    expect(hexToOklch('#ffffff').l).toBeCloseTo(1, 2);
    expect(oklchToHex({ l: 0, c: 0, h: 0 })).toBe('#000000');
    expect(oklchToHex({ l: 1, c: 0, h: 0 })).toBe('#ffffff');
  });

  it('reports no meaningful chroma for a grey, and some for a colour', () => {
    expect(hexToOklch('#8d8d8d').c).toBeLessThan(0.001);
    expect(hexToOklch('#ff6a13').c).toBeGreaterThan(0.15);
  });

  it('always returns a six-digit lower-case hex, whatever it is given', () => {
    const extremes = [
      { l: 0.5, c: 5, h: 120 },
      { l: -1, c: 0.1, h: 0 },
      { l: 2, c: 0.1, h: 0 },
      { l: 0.5, c: -1, h: 720 },
      { l: 0.5, c: 0.2, h: -90 },
    ];

    for (const colour of extremes) {
      expect(oklchToHex(colour)).toMatch(/^#[0-9a-f]{6}$/u);
    }
  });
});

describe('adjusting a colour', () => {
  it('keeps the hue when lightness changes', () => {
    for (const hex of ['#ff6a13', '#199b9d', '#1d5fa8', '#d926c9']) {
      const source = hexToOklch(hex);
      for (const lightness of [0.2, 0.4, 0.6, 0.8]) {
        const moved = hexToOklch(oklchToHex(withLightness(source, lightness)));
        // Shortest way round the hue circle, so 359° and 1° count as two apart.
        // Two degrees is well below a noticeable shift and leaves room for the
        // rounding to eight bits per channel.
        const apart = Math.abs(moved.h - source.h) % 360;
        expect(Math.min(apart, 360 - apart)).toBeLessThan(2);
      }
    }
  });

  it('makes a colour lighter or darker in the direction asked', () => {
    const source = hexToOklch('#199b9d');
    const darker = contrastRatio(oklchToHex(withLightness(source, 0.3)), '#ffffff');
    const lighter = contrastRatio(oklchToHex(withLightness(source, 0.9)), '#ffffff');
    expect(darker).toBeGreaterThan(lighter);
  });

  it('brings an impossible chroma into gamut instead of clipping the hue', () => {
    /*
     * Chroma 0.4 does not exist in sRGB at this lightness. The mapping reduces
     * it until it does, which must leave the hue where it was — clipping the
     * channels instead is what turns a vivid blue violet.
     */
    const wanted = { l: 0.55, c: 0.4, h: 264 };
    const mapped = hexToOklch(oklchToHex(wanted));

    expect(mapped.c).toBeLessThan(0.4);
    expect(mapped.c).toBeGreaterThan(0.05);
    expect(Math.abs(mapped.h - 264)).toBeLessThan(3);
    // And lightness is left alone: moving it would break a contrast guarantee
    // the caller had already established before asking for the hex.
    expect(Math.abs(mapped.l - 0.55)).toBeLessThan(0.02);
  });

  it('is deterministic', () => {
    const colour = { l: 0.62, c: 0.31, h: 17 };
    const first = oklchToHex(colour);
    for (let attempt = 0; attempt < 5; attempt += 1) expect(oklchToHex(colour)).toBe(first);
  });
});

describe('deltaEok', () => {
  it('is zero for a colour against itself', () => {
    expect(deltaEok(hexToOklch('#ff6a13'), hexToOklch('#ff6a13'))).toBeCloseTo(0, 6);
  });

  it('grows with how different two colours look', () => {
    const orange = hexToOklch('#ff6a13');
    const nearlyOrange = hexToOklch('#fa6a18');
    const blue = hexToOklch('#1d5fa8');

    expect(deltaEok(orange, nearlyOrange)).toBeLessThan(deltaEok(orange, blue));
  });

  it('separates a grey from a colour of the same lightness', () => {
    const colour = hexToOklch('#199b9d');
    const grey = withChroma(colour, 0);
    expect(deltaEok(colour, grey)).toBeGreaterThan(0.05);
  });
});
