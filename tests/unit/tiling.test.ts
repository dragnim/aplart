/**
 * The geometry of repeating one rendered tile.
 *
 * Most of this is about a single failure: a half-pixel gap between copies. On a
 * repeating pattern a thin line of background running between the tiles is
 * exactly the artefact somebody has turned the preview on to look for, so
 * showing them one the renderer invented would be worse than not offering the
 * feature.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TILING,
  MAX_TILES,
  MAX_TILE_SCALE,
  MIN_TILES,
  MIN_TILE_SCALE,
  isRepeating,
  normaliseTiling,
  tileAt,
  tileCounts,
  tileGrid,
  tileRect,
  type TilingView,
} from '@/renderer/tiling';

function view(overrides: Partial<TilingView> = {}): TilingView {
  return { ...DEFAULT_TILING, ...overrides };
}

describe('reading a tiling setting from outside', () => {
  it('falls back to a single copy for anything unrecognised', () => {
    for (const value of [null, undefined, 'repeat', 42, {}, { mode: 'wallpaper' }]) {
      expect(normaliseTiling(value).mode).toBe('single');
    }
  });

  it('falls back to a single copy for a mode this build cannot draw', () => {
    /*
     * A later version may add mirrored composition. A link written by it must
     * not open here showing an ordinary repeat while claiming to be mirrored —
     * one copy is never wrong, and a wrong claim is.
     */
    expect(normaliseTiling({ mode: 'mirror-repeat', columns: 3, rows: 3 }).mode).toBe('single');
  });

  it('clamps counts into the range the interface can draw', () => {
    expect(normaliseTiling({ mode: 'repeat', columns: 0, rows: 999 })).toMatchObject({
      columns: MIN_TILES,
      rows: MAX_TILES,
    });
  });

  it('clamps the scale', () => {
    expect(normaliseTiling({ mode: 'repeat', scale: 99 }).scale).toBe(MAX_TILE_SCALE);
    expect(normaliseTiling({ mode: 'repeat', scale: 0 }).scale).toBe(MIN_TILE_SCALE);
    expect(normaliseTiling({ mode: 'repeat', scale: 'big' }).scale).toBe(1);
  });

  it('ignores a field no interface can honour', () => {
    // Seam guides belong to a later stage. Reading the key now would commit the
    // shared format to a setting nothing can act on.
    expect(normaliseTiling({ mode: 'repeat', showSeamGuides: true })).not.toHaveProperty('showSeamGuides');
  });

  it('keeps a usable setting untouched', () => {
    const settings = { mode: 'repeat' as const, columns: 5, rows: 2, scale: 1 };
    expect(normaliseTiling(settings)).toEqual(settings);
  });

  it('rounds a fractional count to something a grid can be made of', () => {
    expect(normaliseTiling({ mode: 'repeat', columns: 2.6, rows: 3.2 })).toMatchObject({
      columns: 3,
      rows: 3,
    });
  });
});

describe('whether anything is actually repeated', () => {
  it('is false for a single copy however many rows are configured', () => {
    expect(isRepeating(view({ mode: 'single', columns: 5, rows: 5 }))).toBe(false);
    expect(isRepeating(undefined)).toBe(false);
  });

  it('is false for a repeat of one by one, which is a single copy', () => {
    // Otherwise the drawing path would take the tiled branch to draw exactly
    // one tile, and the pointer would take a different one to find it.
    expect(isRepeating(view({ mode: 'repeat', columns: 1, rows: 1 }))).toBe(false);
    expect(tileCounts(view({ mode: 'repeat', columns: 1, rows: 1 }))).toEqual({ columns: 1, rows: 1 });
  });

  it('is true once there is more than one copy', () => {
    expect(isRepeating(view({ mode: 'repeat', columns: 2, rows: 1 }))).toBe(true);
    expect(isRepeating(view({ mode: 'repeat', columns: 1, rows: 2 }))).toBe(true);
  });
});

describe('laying out the copies', () => {
  it('reduces to the plain letterbox when nothing repeats', () => {
    // One copy has to land exactly where it landed before any of this existed,
    // or every artwork moves slightly the day the feature ships.
    const grid = tileGrid(100, 50, 1, 1, 400, 400);
    expect(grid.box).toEqual({ left: 0, top: 100, width: 400, height: 200 });
    expect(tileRect(grid, 0, 0)).toEqual({ left: 0, top: 100, width: 400, height: 200 });
  });

  it('keeps the artwork’s aspect ratio in every copy', () => {
    // A 2:1 tile in a 3 × 3 grid is a 6:3 composition, so it still fits a square
    // box exactly, and each copy is 2:1.
    const grid = tileGrid(100, 50, 3, 3, 300, 300);
    const cell = tileRect(grid, 1, 1);
    expect(cell.width / cell.height).toBeCloseTo(2, 6);
  });

  it('leaves no gap between neighbours, at awkward sizes', () => {
    /*
     * The case that matters. Three copies across 401 pixels cannot each be a
     * whole number of pixels wide, so rounding each width independently leaves
     * a tile ending at 133.67 beside one starting at 134 — and that third of a
     * pixel is a visible line down a repeating pattern.
     */
    for (const across of [2, 3, 5, 7]) {
      for (const boxWidth of [401, 403, 499, 1001]) {
        const grid = tileGrid(64, 64, across, across, boxWidth, boxWidth + 3);
        for (let column = 0; column + 1 < across; column += 1) {
          const left = tileRect(grid, column, 0);
          const right = tileRect(grid, column + 1, 0);
          expect(left.left + left.width, `${String(across)} across ${String(boxWidth)}px`).toBe(right.left);
        }
        for (let row = 0; row + 1 < across; row += 1) {
          const above = tileRect(grid, 0, row);
          const below = tileRect(grid, 0, row + 1);
          expect(above.top + above.height).toBe(below.top);
        }
      }
    }
  });

  it('covers the whole composition, losing nothing to rounding', () => {
    const grid = tileGrid(64, 64, 5, 5, 501, 501);
    const first = tileRect(grid, 0, 0);
    const last = tileRect(grid, 4, 4);

    expect(first.left).toBe(Math.round(grid.box.left));
    expect(last.left + last.width).toBe(Math.round(grid.box.left + grid.box.width));
  });

  it('gives every copy the same size to within a pixel', () => {
    const grid = tileGrid(64, 64, 5, 5, 503, 503);
    const widths = [0, 1, 2, 3, 4].map((column) => tileRect(grid, column, 0).width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  });

  it('survives a box with no room in it', () => {
    const grid = tileGrid(64, 64, 3, 3, 0, 0);
    expect(grid.box).toEqual({ left: 0, top: 0, width: 0, height: 0 });
    expect(tileRect(grid, 0, 0).width).toBe(0);
  });
});

describe('finding which copy was pressed', () => {
  const grid = tileGrid(64, 64, 3, 3, 300, 300);

  it('reports the copy and the position inside it', () => {
    const middle = tileRect(grid, 1, 1);
    const hit = tileAt(grid, middle.left + middle.width / 2, middle.top + middle.height / 2);

    expect(hit).toMatchObject({ column: 1, row: 1 });
    expect(hit?.u).toBeCloseTo(0.5, 2);
    expect(hit?.v).toBeCloseTo(0.5, 2);
  });

  it('gives the same position within every copy for the same relative point', () => {
    /*
     * The property the inspector rests on: a quarter of the way into any copy
     * is a quarter of the way into the artwork, so every copy names the same
     * source cell.
     */
    const readings = [];
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const cell = tileRect(grid, column, row);
        const hit = tileAt(grid, cell.left + cell.width * 0.25, cell.top + cell.height * 0.75);
        readings.push([Number(hit?.u.toFixed(2)), Number(hit?.v.toFixed(2))]);
      }
    }

    expect(new Set(readings.map((pair) => pair.join(',')))).toEqual(new Set(['0.25,0.75']));
  });

  it('misses the mat beside the artwork rather than rounding onto it', () => {
    // A tall box, so there is letterboxed space above and below.
    const tall = tileGrid(64, 64, 2, 2, 200, 400);
    expect(tileAt(tall, 100, 1)).toBeNull();
    expect(tileAt(tall, 100, 399)).toBeNull();
    expect(tileAt(tall, -5, 200)).toBeNull();
  });

  it('never reports a copy that does not exist', () => {
    for (let x = 0; x <= 300; x += 7) {
      for (let y = 0; y <= 300; y += 7) {
        const hit = tileAt(grid, x, y);
        if (hit === null) continue;
        expect(hit.column).toBeGreaterThanOrEqual(0);
        expect(hit.column).toBeLessThan(3);
        expect(hit.row).toBeGreaterThanOrEqual(0);
        expect(hit.row).toBeLessThan(3);
      }
    }
  });
});

describe('tile scale', () => {
  it('changes nothing at 100%', () => {
    const plain = tileGrid(64, 64, 3, 3, 400, 400);
    const scaled = tileGrid(64, 64, 3, 3, 400, 400, 1);
    expect(scaled).toEqual(plain);
  });

  it('fits more copies when the tiles are smaller', () => {
    const grid = tileGrid(64, 64, 3, 3, 300, 300, 0.5);
    // Half the size, so twice as many span the same region.
    expect(grid.columns).toBe(6);
    expect(grid.rows).toBe(6);
    expect(tileRect(grid, 0, 0).width).toBe(50);
  });

  it('fits fewer, larger copies when the tiles are bigger', () => {
    const grid = tileGrid(64, 64, 4, 4, 400, 400, 2);
    expect(grid.columns).toBe(2);
    expect(tileRect(grid, 0, 0).width).toBe(200);
  });

  it('keeps the artwork region exactly where it was, whatever the scale', () => {
    /*
     * The region is the artwork's place on the canvas. Scaling changes how
     * densely it is filled; it must not move or resize the artwork itself, or
     * the letterbox would breathe every time somebody changed the density.
     */
    const reference = tileGrid(64, 64, 3, 3, 500, 380).region;
    for (const scale of [0.5, 0.75, 1, 1.5, 2]) {
      expect(tileGrid(64, 64, 3, 3, 500, 380, scale).region, String(scale)).toEqual(reference);
    }
  });

  it('lands flush where the scale divides the count, and overhangs evenly where it does not', () => {
    /*
     * Not every offered scale divides every count: three copies at 75% is four
     * exactly, but two copies at 75% is two and two thirds. Both are fine — the
     * first shows no clipped edge, the second clips equally at both — and the
     * point is that neither is lopsided.
     */
    for (const count of [2, 3, 5]) {
      for (const scale of [0.5, 0.75, 1, 1.5, 2]) {
        const grid = tileGrid(64, 64, count, count, 480, 480, scale);
        const first = tileRect(grid, 0, 0);
        const last = tileRect(grid, grid.columns - 1, 0);
        const where = `${String(count)} at ${String(scale)}`;

        const before = Math.round(grid.region.left) - first.left;
        const after = last.left + last.width - Math.round(grid.region.left + grid.region.width);

        expect(before, where).toBeGreaterThanOrEqual(0);
        expect(after, where).toBeGreaterThanOrEqual(0);
        expect(Math.abs(before - after), where).toBeLessThanOrEqual(1);

        // Whole copies where the arithmetic allows it.
        const divides = Math.abs(count / scale - Math.round(count / scale)) < 1e-9;
        if (divides) expect(before, `${where} should be flush`).toBe(0);
      }
    }
  });

  it('overhangs symmetrically at a scale that does not divide evenly', () => {
    const grid = tileGrid(64, 64, 3, 3, 300, 300, 1.7);
    const first = tileRect(grid, 0, 0);
    const last = tileRect(grid, grid.columns - 1, 0);

    const before = grid.region.left - first.left;
    const after = last.left + last.width - (grid.region.left + grid.region.width);
    expect(before).toBeGreaterThan(0);
    expect(Math.abs(before - after)).toBeLessThanOrEqual(1);
  });

  it('leaves no gap between neighbours at any scale', () => {
    for (const scale of [0.5, 0.75, 1.5, 2, 1.3]) {
      for (const boxWidth of [401, 499, 1001]) {
        const grid = tileGrid(64, 64, 3, 3, boxWidth, boxWidth, scale);
        for (let column = 0; column + 1 < grid.columns; column += 1) {
          const left = tileRect(grid, column, 0);
          const right = tileRect(grid, column + 1, 0);
          expect(left.left + left.width, `${String(scale)} at ${String(boxWidth)}px`).toBe(right.left);
        }
      }
    }
  });

  it('never lets a press land outside the artwork region', () => {
    // At 200% the copies overhang, and the overhang is clipped when drawn. A
    // press on the mat beside the artwork must still miss.
    const grid = tileGrid(64, 64, 3, 3, 300, 500, 2);
    expect(tileAt(grid, 150, 5)).toBeNull();
    expect(tileAt(grid, 150, 495)).toBeNull();
    expect(tileAt(grid, 150, 250)).not.toBeNull();
  });
});

describe('a press exactly on a boundary', () => {
  /*
   * It does not matter which side wins, but drawing and inspection have to
   * agree. A copy is painted from its left edge for its own width, so the
   * shared pixel belongs to the copy on the right — and the reading must say
   * the same, or a press on the line names the artwork's last column while the
   * pixel under it came from the first.
   */
  const grid = tileGrid(64, 64, 3, 3, 300, 300);

  it('resolves to the copy on the right, as drawn', () => {
    const boundary = tileRect(grid, 0, 0).left + tileRect(grid, 0, 0).width;
    const hit = tileAt(grid, boundary, 150);

    expect(hit?.column).toBe(1);
    expect(hit?.u).toBe(0);
  });

  it('resolves to the copy below, as drawn', () => {
    const boundary = tileRect(grid, 0, 0).top + tileRect(grid, 0, 0).height;
    expect(tileAt(grid, 150, boundary)?.row).toBe(1);
    expect(tileAt(grid, 150, boundary)?.v).toBe(0);
  });

  it('keeps the final edge with the last copy, there being nothing beyond it', () => {
    const last = tileRect(grid, 2, 2);
    const hit = tileAt(grid, last.left + last.width, last.top + last.height);

    expect(hit).toMatchObject({ column: 2, row: 2 });
    expect(hit?.u).toBe(1);
  });

  it('is deterministic: the same point always gives the same answer', () => {
    const boundary = tileRect(grid, 1, 0).left;
    const answers = new Set(Array.from({ length: 20 }, () => JSON.stringify(tileAt(grid, boundary, 150))));
    expect(answers.size).toBe(1);
  });
});
