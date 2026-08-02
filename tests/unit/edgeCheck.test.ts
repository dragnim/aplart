/**
 * Comparing a tile's opposite edges.
 *
 * The arithmetic is simple; what these are really about is the boundary between
 * what the check knows and what it must not claim. It looks at rendered pixels.
 * It cannot tell whether an APL expression is periodic, and every result it
 * gives is worded so that nobody could read it as though it had.
 */

import { describe, expect, it } from 'vitest';
import {
  EDGE_CHECK_CAVEAT,
  EDGE_TOLERANCE,
  checkEdges,
  describeEdge,
  type EdgeVerdict,
} from '@/renderer/edgeCheck';
import { type RgbaImage } from '@/renderer/colourMapping';

/** Builds an image from a function of position, so edges can be arranged. */
function image(
  width: number,
  height: number,
  colour: (x: number, y: number) => readonly [number, number, number, number],
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = colour(x, y);
      const at = (y * width + x) * 4;
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
      data[at + 3] = a;
    }
  }
  return { width, height, data };
}

const opaque = (value: number) => [value, value, value, 255] as const;

describe('edges that match', () => {
  it('reports an exact match when the left and right columns are identical', () => {
    // Columns vary down the image so the comparison is not trivially uniform,
    // and the first and last are made the same.
    const tile = image(8, 8, (x, y) => opaque(x === 0 || x === 7 ? 10 + y * 5 : 200));
    const result = checkEdges(tile);

    expect(result?.horizontal.verdict).toBe('exact');
    expect(result?.horizontal.differingPixels).toBe(0);
    expect(result?.horizontal.comparedPixels).toBe(8);
  });

  it('reports an exact match when the top and bottom rows are identical', () => {
    const tile = image(8, 8, (x, y) => opaque(y === 0 || y === 7 ? 10 + x * 5 : 200));
    const result = checkEdges(tile);

    expect(result?.vertical.verdict).toBe('exact');
    expect(result?.horizontal.verdict).toBe('mismatch');
  });

  it('keeps the two axes independent', () => {
    // Matching top and bottom says nothing about left and right, and a check
    // that reported one number would hide exactly the useful half.
    const tile = image(8, 8, (x, y) => opaque(y === 0 || y === 7 ? 60 : 20 + x * 20));
    const result = checkEdges(tile);

    expect(result?.vertical.verdict).toBe('exact');
    expect(result?.horizontal.verdict).toBe('mismatch');
  });
});

describe('edges that nearly match', () => {
  it('accepts a difference small enough to be anti-aliasing', () => {
    /*
     * A motif renderer draws curves, and a curve resolved on one edge can differ by
     * a shade from the same curve resolved on the other. That is a match to the
     * eye and to any honest reading of the picture.
     */
    const tile = image(8, 8, (x, y) => opaque(x === 7 ? 100 + (y % 2 === 0 ? EDGE_TOLERANCE : 0) : 100));
    const result = checkEdges(tile);

    expect(result?.horizontal.verdict).toBe('tolerant');
    expect(result?.horizontal.maximumDifference).toBe(EDGE_TOLERANCE);
  });

  it('refuses a difference past the tolerance', () => {
    const tile = image(8, 8, (x, y) => opaque(x === 7 && y === 0 ? 100 + EDGE_TOLERANCE + 1 : 100));
    const result = checkEdges(tile);

    expect(result?.horizontal.verdict).toBe('mismatch');
    expect(result?.horizontal.maximumDifference).toBe(EDGE_TOLERANCE + 1);
  });

  it('accepts a small difference along the whole edge, and says how many', () => {
    /*
     * Judged on how far out the worst pixel is, not how many are out. Where a
     * curve meets an edge a genuine match can differ by a shade nearly
     * everywhere along it, so counting pixels would reject the very case the
     * tolerance exists for. The count is still reported, for anyone who wants
     * to know how widespread the difference is.
     */
    const tile = image(8, 8, (x) => opaque(x === 7 ? 104 : 100));
    const result = checkEdges(tile);

    expect(result?.horizontal.verdict).toBe('tolerant');
    expect(result?.horizontal.differingPixels).toBe(8);
    expect(result?.horizontal.maximumDifference).toBe(4);
  });
});

describe('what it compares', () => {
  it('looks along the whole edge, not at a corner', () => {
    // Agreeing at the corners and nowhere else is the failure a single-pixel
    // check would call a match.
    const tile = image(8, 8, (x, y) => {
      const corner = y === 0 || y === 7;
      if (x === 0) return opaque(50);
      if (x === 7) return opaque(corner ? 50 : 220);
      return opaque(120);
    });

    expect(checkEdges(tile)?.horizontal.verdict).toBe('mismatch');
  });

  it('notices a difference in transparency alone', () => {
    // A cell that has not arrived is transparent. Against an opaque one that is
    // a difference the eye sees even where the colours agree.
    const tile = image(8, 8, (x) => [100, 100, 100, x === 7 ? 0 : 255] as const);
    expect(checkEdges(tile)?.horizontal.verdict).toBe('mismatch');
  });

  it('declines to answer about an image too small to have opposite edges', () => {
    expect(checkEdges(image(1, 8, () => opaque(0)))).toBeNull();
    expect(checkEdges(image(8, 1, () => opaque(0)))).toBeNull();
  });
});

describe('how it is worded', () => {
  it('says what it found without borrowing a word it has not earned', () => {
    const said: string[] = [];
    for (const verdict of ['exact', 'tolerant', 'mismatch'] as EdgeVerdict[]) {
      for (const pair of ['horizontal', 'vertical'] as const) {
        said.push(
          describeEdge(pair, {
            verdict,
            differingPixels: 0,
            comparedPixels: 8,
            maximumDifference: 0,
            meanDifference: 0,
          }),
        );
      }
    }

    /*
     * None of these may say "seamless", "guaranteed" or "verified". The claim
     * that an artwork tiles belongs to its APL and its declared edge contract,
     * and a pixel comparison must never be read as having established it.
     */
    for (const sentence of said) {
      expect(sentence).not.toMatch(/seamless|guarantee|verified|mathematic/i);
    }

    expect(said).toContain('Left and right edges match exactly.');
    expect(said).toContain('Top and bottom edges appear to match within rendering tolerance.');
    expect(said).toContain('Left and right edges do not match.');
  });

  it('carries a caveat that says what the check is not', () => {
    expect(EDGE_CHECK_CAVEAT).toContain('not proof');
    expect(EDGE_CHECK_CAVEAT).toContain('rendered edges');
  });
});
