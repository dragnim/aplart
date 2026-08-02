/**
 * Whether Truchet's motifs are built to meet.
 *
 * A verification spike, kept as a test. The question is not whether one
 * rendered result happens to have matching edges — a pixel comparison can say
 * that and it proves nothing about the next seed. The question is whether the
 * *shapes* are defined so that any tile can sit beside any other, which is a
 * property of the four motifs and can be settled by looking at them.
 *
 * It is settled by computing, not by looking at screenshots: for each motif and
 * each of its four edges, where along that edge the drawn line crosses. Two
 * tiles meet continuously exactly when the signature on the shared edge is the
 * same from both sides.
 */

import { describe, expect, it } from 'vitest';
import { MOTIFS, edgeSignature, edgeTangent, joinsCleanly, type Motif } from '@/renderer/motifGeometry';
import { matrixStats } from '@/matrix/matrixStats';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { renderMotifsToRgba } from '@/renderer/renderMotifs';
import { DIAGNOSTIC_PALETTE, checkEdgeRendering } from '@/renderer/edgeCheck';
import { defaultRenderOptions, transformMatrix, type RenderOptions } from '@/renderer/renderOptions';

/** The stroke width at a typical cell size; the finding does not depend on it. */
const STROKE = 0.13;

const ARCS: readonly Motif[] = ['arcsNwSe', 'arcsNeSw'];
const DIAGONALS: readonly Motif[] = ['diagonalNwSe', 'diagonalNeSw'];

describe('what each motif does at its edges', () => {
  it('has exactly four motifs, which is what bounds the class control', () => {
    expect(MOTIFS).toEqual(['arcsNwSe', 'arcsNeSw', 'diagonalNwSe', 'diagonalNeSw']);
  });

  it('brings both arcs to the midpoint of all four edges', () => {
    /*
     * The arcs are quarter circles of radius one half centred on opposite
     * corners, so each one leaves through the middle of two edges — and between
     * the two arcs in a tile, all four edges are crossed at their midpoints.
     * The same span every time is what makes the tiles interchangeable.
     */
    for (const motif of ARCS) {
      for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
        const spans = edgeSignature(motif, edge, STROKE);
        expect(spans, `${motif} ${edge}`).toHaveLength(1);
        expect(spans[0]?.start).toBeCloseTo(0.5 - STROKE / 2, 2);
        expect(spans[0]?.end).toBeCloseTo(0.5 + STROKE / 2, 2);
      }
    }
  });

  it('brings the diagonals to a corner instead', () => {
    // A straight line from corner to corner leaves through the corners, not the
    // middles. This is the whole of the difference.
    for (const motif of DIAGONALS) {
      for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
        const spans = edgeSignature(motif, edge, STROKE);
        expect(spans, `${motif} ${edge}`).toHaveLength(1);
        const touchesACorner = (spans[0]?.start ?? 1) < 0.1 || (spans[0]?.end ?? 0) > 0.9;
        expect(touchesACorner, `${motif} ${edge}`).toBe(true);
      }
    }
  });
});

describe('which motifs can sit beside which', () => {
  it('lets any arc meet any arc, both ways round and in both directions', () => {
    for (const left of ARCS) {
      for (const right of ARCS) {
        expect(joinsCleanly(left, right, 'horizontal', STROKE), `${left}|${right}`).toBe(true);
        expect(joinsCleanly(left, right, 'vertical', STROKE), `${left}/${right}`).toBe(true);
      }
    }
  });

  it('never lets an arc meet a diagonal', () => {
    /*
     * One arrives at the middle of the edge and the other at a corner, so the
     * line simply stops. This is the finding that decides the question: a
     * tiling that can contain both is not edge-compatible by construction.
     */
    for (const arc of ARCS) {
      for (const diagonal of DIAGONALS) {
        expect(joinsCleanly(arc, diagonal, 'horizontal'), `${arc}|${diagonal}`).toBe(false);
        expect(joinsCleanly(diagonal, arc, 'horizontal'), `${diagonal}|${arc}`).toBe(false);
        expect(joinsCleanly(arc, diagonal, 'vertical'), `${arc}/${diagonal}`).toBe(false);
        expect(joinsCleanly(diagonal, arc, 'vertical'), `${diagonal}/${arc}`).toBe(false);
      }
    }
  });

  it('lets a diagonal meet only the other diagonal', () => {
    // Each diagonal leaves one edge at its top corner and the opposite edge at
    // its bottom corner, so it lines up with its mirror and not with itself.
    expect(joinsCleanly('diagonalNwSe', 'diagonalNeSw', 'horizontal')).toBe(true);
    expect(joinsCleanly('diagonalNeSw', 'diagonalNwSe', 'horizontal')).toBe(true);
    expect(joinsCleanly('diagonalNwSe', 'diagonalNwSe', 'horizontal')).toBe(false);
    expect(joinsCleanly('diagonalNeSw', 'diagonalNeSw', 'horizontal')).toBe(false);
  });
});

describe('the property the preset can actually claim', () => {
  /*
   * Stated as the rule the artwork depends on, so that widening the class
   * control or adding a motif fails here rather than quietly producing tiles
   * that no longer meet.
   */
  const classesAllowed = (count: number) => MOTIFS.slice(0, count);

  it('is compatible in every pairing at two shapes', () => {
    const available = classesAllowed(2);
    for (const left of available) {
      for (const right of available) {
        expect(joinsCleanly(left, right, 'horizontal'), `${left}|${right}`).toBe(true);
        expect(joinsCleanly(left, right, 'vertical'), `${left}/${right}`).toBe(true);
      }
    }
  });

  it('is not compatible at three or four shapes', () => {
    // Recorded rather than wished away. The diagonals are a deliberate part of
    // the artwork and they are not edge-compatible with the arcs.
    for (const count of [3, 4]) {
      const available = classesAllowed(count);
      const pairs = available.flatMap((left) => available.map((right) => [left, right] as const));
      const bad = pairs.filter(([left, right]) => !joinsCleanly(left, right, 'horizontal'));

      expect(bad.length, `at ${String(count)} shapes`).toBeGreaterThan(0);
    }
  });

  it('does not depend on how thick the line is', () => {
    // The stroke varies with cell size, so the conclusion must not.
    for (const stroke of [0.05, 0.13, 0.2, 0.3]) {
      expect(joinsCleanly('arcsNwSe', 'arcsNeSw', 'horizontal', stroke), String(stroke)).toBe(true);
      expect(joinsCleanly('arcsNwSe', 'diagonalNwSe', 'horizontal', stroke), String(stroke)).toBe(false);
    }
  });
});

describe('what that means for a rendered tiling', () => {
  /*
   * The analytical result says any two arcs meet. This checks the consequence
   * on real rendered tiles, across sizes, seeds and every orientation the
   * appearance controls offer — because that is the claim a preset would be
   * making, and it should fail here if a motif or a transform ever changes.
   */
  const classField = (size: number, seed: number, classes: number): NumericMatrix => {
    let state = seed * 2654435761;
    const values = new Float64Array(size * size);
    for (let index = 0; index < values.length; index += 1) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      values[index] = state % classes;
    }
    return { rows: size, columns: size, values };
  };

  const edgesOf = (matrix: NumericMatrix, options: Partial<RenderOptions> = {}) => {
    const settings = { ...defaultRenderOptions('mono'), ...options };
    const image = renderMotifsToRgba(transformMatrix(matrix, settings), matrixStats(matrix), {
      palette: DIAGNOSTIC_PALETTE,
    });
    return checkEdgeRendering(image);
  };

  /*
   * Split rather than crossed. The first version ran every size against every
   * seed against all sixteen orientations — 256 renders of up to a megapixel
   * each, comfortable here and well past the limit on a CI worker. The
   * orientations permute the matrix and the sizes change how much of it there
   * is; neither interacts with the other, so testing them separately covers the
   * same ground for an eighth of the work.
   */
  it('matches on every edge at two shapes, whatever the size or seed', () => {
    for (const size of [8, 12, 20, 33]) {
      for (const seed of [1, 7, 23, 101]) {
        const result = edgesOf(classField(size, seed, 2));
        const where = `${String(size)} cells, seed ${String(seed)}`;
        expect(result?.horizontal.verdict, where).toBe('exact');
        expect(result?.vertical.verdict, where).toBe('exact');
      }
    }
  });

  it('matches under every rotation and mirror the controls offer', () => {
    const matrix = classField(12, 7, 2);
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const mirrorHorizontally of [false, true]) {
        for (const mirrorVertically of [false, true]) {
          const result = edgesOf(matrix, { rotation, mirrorHorizontally, mirrorVertically });
          const where = `${String(rotation)}° h:${String(mirrorHorizontally)} v:${String(mirrorVertically)}`;
          expect(result?.horizontal.verdict, where).toBe('exact');
          expect(result?.vertical.verdict, where).toBe('exact');
        }
      }
    }
  });

  it('matches for a large non-default seed turned and mirrored at once', () => {
    /*
     * One combined case kept deliberately. Size, seed and orientation are
     * tested separately because they exercise independent transforms, and this
     * guards the assumption that they do not interact — the largest tested
     * tiling, an unusual seed, rotated and mirrored on both axes together.
     */
    const result = edgesOf(classField(33, 101, 2), {
      rotation: 270,
      mirrorHorizontally: true,
      mirrorVertically: true,
    });

    expect(result?.horizontal.verdict).toBe('exact');
    expect(result?.vertical.verdict).toBe('exact');
  });

  it('does not match once the diagonals are allowed in', () => {
    // Not a defect to be fixed here — the diagonals are meant to cut across the
    // flow. It is the reason the compatible-by-construction claim is limited to
    // two shapes, and it is recorded so nobody widens that claim by accident.
    let mismatches = 0;
    for (const classes of [3, 4]) {
      for (const seed of [1, 7, 23, 101]) {
        const result = edgesOf(classField(16, seed, classes));
        if (result?.horizontal.verdict !== 'exact' || result.vertical.verdict !== 'exact') {
          mismatches += 1;
        }
      }
    }
    expect(mismatches).toBeGreaterThan(0);
  });

  it('matches for a tiling made only of diagonals of both kinds', () => {
    /*
     * The other compatible case, and worth pinning: a checkerboard of the two
     * diagonals meets at every corner. It is not what the class control
     * produces — that picks classes by hash — but it shows the finding is about
     * which shapes are adjacent rather than about the diagonals being unusable.
     */
    const size = 12;
    const values = new Float64Array(size * size);
    for (let index = 0; index < values.length; index += 1) {
      const row = Math.floor(index / size);
      const column = index % size;
      values[index] = (row + column) % 2 === 0 ? 2 : 3;
    }

    const result = edgesOf({ rows: size, columns: size, values });
    expect(result?.horizontal.verdict).toBe('exact');
    expect(result?.vertical.verdict).toBe('exact');
  });
});

describe('the direction the line takes at an edge', () => {
  /*
   * The stronger half of the claim. Occupancy says two tiles have ink in the
   * same place; direction says the line goes the same way through it, so the
   * join is a continuation rather than a corner. Without this, "compatible"
   * would only mean "no gap".
   */
  it('brings every arc across its edge square on', () => {
    for (const motif of ARCS) {
      for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
        const tangent = edgeTangent(motif, edge, STROKE);
        const where = `${motif} ${edge}`;

        expect(tangent, where).not.toBeNull();
        // Perpendicular: nothing along the edge, everything across it.
        expect(tangent?.alongEdge ?? 1, where).toBeLessThan(0.1);
        expect(tangent?.acrossEdge ?? 0, where).toBeGreaterThan(0.9);
      }
    }
  });

  it('gives every arc-to-arc pairing the same direction on both sides', () => {
    /*
     * The pairing, not just the individual motifs. Both sides of a shared edge
     * cross it square on, so the curve continues without a kink — in both
     * directions and for all four orderings.
     */
    for (const first of ARCS) {
      for (const second of ARCS) {
        for (const [leaving, arriving] of [
          ['right', 'left'],
          ['bottom', 'top'],
        ] as const) {
          const out = edgeTangent(first, leaving, STROKE);
          const into = edgeTangent(second, arriving, STROKE);
          const where = `${first}|${second} ${leaving}`;

          expect(out?.alongEdge, where).toBeCloseTo(into?.alongEdge ?? -1, 1);
          expect(out?.acrossEdge, where).toBeCloseTo(into?.acrossEdge ?? -1, 1);
        }
      }
    }
  });

  it('does not bring the diagonals across square on', () => {
    // A diagonal meets the edge at forty-five degrees, which is the other half
    // of why it cannot continue an arc.
    for (const motif of DIAGONALS) {
      const tangent = edgeTangent(motif, 'right', STROKE);
      expect(tangent?.alongEdge ?? 0, motif).toBeGreaterThan(0.3);
    }
  });
});
