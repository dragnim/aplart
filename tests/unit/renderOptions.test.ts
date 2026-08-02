import { describe, expect, it } from 'vitest';
import { fromNested, toNested, type NumericMatrix } from '@/matrix/matrixTypes';
import {
  ROTATIONS,
  defaultRenderOptions,
  transformMatrix,
  type RenderOptions,
} from '@/renderer/renderOptions';
import { exportDimensions, exportFilename } from '@/renderer/exportPng';

/**
 * Deliberately not square and not symmetric, so a rotation that is transposed,
 * reflected or off by one axis cannot accidentally pass.
 */
const MATRIX = fromNested([
  [1, 2, 3],
  [4, 5, 6],
]);

function options(overrides: Partial<RenderOptions> = {}): RenderOptions {
  return { ...defaultRenderOptions('ember'), ...overrides };
}

describe('transformMatrix', () => {
  it('returns the matrix untouched by default', () => {
    expect(toNested(transformMatrix(MATRIX, options()))).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('rotates a quarter turn clockwise, swapping the axes', () => {
    const rotated = transformMatrix(MATRIX, options({ rotation: 90 }));
    expect(rotated.rows).toBe(3);
    expect(rotated.columns).toBe(2);
    expect(toNested(rotated)).toEqual([
      [4, 1],
      [5, 2],
      [6, 3],
    ]);
  });

  it('rotates a half turn', () => {
    expect(toNested(transformMatrix(MATRIX, options({ rotation: 180 })))).toEqual([
      [6, 5, 4],
      [3, 2, 1],
    ]);
  });

  it('rotates three quarters', () => {
    expect(toNested(transformMatrix(MATRIX, options({ rotation: 270 })))).toEqual([
      [3, 6],
      [2, 5],
      [1, 4],
    ]);
  });

  it('returns to the original after four quarter turns', () => {
    let current = MATRIX;
    for (let turn = 0; turn < 4; turn += 1) {
      current = transformMatrix(current, options({ rotation: 90 }));
    }
    expect(toNested(current)).toEqual(toNested(MATRIX));
  });

  it('mirrors horizontally', () => {
    expect(toNested(transformMatrix(MATRIX, options({ mirrorHorizontally: true })))).toEqual([
      [3, 2, 1],
      [6, 5, 4],
    ]);
  });

  it('mirrors vertically', () => {
    expect(toNested(transformMatrix(MATRIX, options({ mirrorVertically: true })))).toEqual([
      [4, 5, 6],
      [1, 2, 3],
    ]);
  });

  it('mirroring both ways is the same as a half turn', () => {
    const mirrored = transformMatrix(MATRIX, options({ mirrorHorizontally: true, mirrorVertically: true }));
    expect(toNested(mirrored)).toEqual(toNested(transformMatrix(MATRIX, options({ rotation: 180 }))));
  });

  it('applies mirrors before rotation, so the controls compose predictably', () => {
    const combined = transformMatrix(MATRIX, options({ mirrorHorizontally: true, rotation: 90 }));
    const stepwise = transformMatrix(
      transformMatrix(MATRIX, options({ mirrorHorizontally: true })),
      options({ rotation: 90 }),
    );
    expect(toNested(combined)).toEqual(toNested(stepwise));
  });

  it('never loses or invents a value', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const transformed = transformMatrix(MATRIX, options({ rotation }));
      expect([...transformed.values].sort()).toEqual([...MATRIX.values].sort());
    }
  });
});

describe('exportFilename', () => {
  it('builds a descriptive name', () => {
    expect(exportFilename('Modular Bloom', 1024)).toBe('apl-art-modular-bloom-1024px.png');
  });

  it('strips anything that could escape a directory or break a filesystem', () => {
    const name = exportFilename('../../etc/passwd', 512);
    expect(name).toBe('apl-art-etc-passwd-512px.png');
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
  });

  it('handles a title made entirely of symbols', () => {
    expect(exportFilename('⍳⍴∘.×', 512)).toBe('apl-art-artwork-512px.png');
  });

  it('does not produce a hidden file', () => {
    expect(exportFilename('.hidden', 512).startsWith('.')).toBe(false);
  });

  it('caps the length of a very long title', () => {
    expect(exportFilename('x'.repeat(500), 512).length).toBeLessThan(90);
  });

  it('labels an original-size export', () => {
    expect(exportFilename('Checker Shift', 'original')).toBe('apl-art-checker-shift-original.png');
  });
});

describe('exportDimensions', () => {
  it('scales up by a whole number so cells stay square', () => {
    // 64 cells into 1024 pixels is exactly 16 each.
    const matrix = fromNested(Array.from({ length: 64 }, () => Array.from({ length: 64 }, () => 0)));
    expect(exportDimensions(matrix, options(), 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it('rounds the factor down rather than producing uneven cells', () => {
    // 90 into 1024 is 11.4; 11 keeps every cell identical.
    const matrix = fromNested(Array.from({ length: 90 }, () => Array.from({ length: 90 }, () => 0)));
    expect(exportDimensions(matrix, options(), 1024)).toEqual({ width: 990, height: 990 });
  });

  it('reports the cell count for an original-size export', () => {
    expect(exportDimensions(MATRIX, options(), 'original')).toEqual({ width: 3, height: 2 });
  });

  it('accounts for a rotation that swaps the axes', () => {
    expect(exportDimensions(MATRIX, options({ rotation: 90 }), 'original')).toEqual({
      width: 2,
      height: 3,
    });
  });
});

describe('cells that have not arrived, under every orientation', () => {
  /*
   * A banded run marks unfetched cells not-a-number, and the orientation
   * transforms run before the renderer sees them. Permuting must move absence
   * around; it must never create a value where there was none, and never lose
   * one that was there. This is the property that made not-a-number the right
   * marker instead of a count of filled cells — a count describes positions,
   * and positions are exactly what these transforms change.
   */
  const ROWS = 3;
  const COLUMNS = 4;

  /** The first `filled` cells hold their index; the rest hold nothing. */
  function partlyArrived(filled: number): NumericMatrix {
    const values = new Float64Array(ROWS * COLUMNS);
    for (let index = 0; index < values.length; index += 1) {
      values[index] = index < filled ? index + 1 : Number.NaN;
    }
    return { rows: ROWS, columns: COLUMNS, values };
  }

  const orientations = ROTATIONS.flatMap((rotation) =>
    [false, true].flatMap((mirrorHorizontally) =>
      [false, true].map((mirrorVertically) => ({ rotation, mirrorHorizontally, mirrorVertically })),
    ),
  );

  it('keeps absence absent and values whole, in all sixteen combinations', () => {
    for (const filled of [0, 1, 7, ROWS * COLUMNS]) {
      const matrix = partlyArrived(filled);

      for (const orientation of orientations) {
        const options = { ...defaultRenderOptions('heat'), ...orientation };
        const moved = transformMatrix(matrix, options);
        const where = `${filled} filled, ${JSON.stringify(orientation)}`;

        const present = [...moved.values].filter((value) => Number.isFinite(value));
        const absent = [...moved.values].filter((value) => Number.isNaN(value));

        // Exactly as many of each as went in: nothing invented, nothing lost.
        expect(present.length, where).toBe(filled);
        expect(absent.length, where).toBe(ROWS * COLUMNS - filled);

        // And the values themselves are the same set, merely somewhere else.
        expect(
          [...present].sort((a, b) => a - b),
          where,
        ).toEqual(Array.from({ length: filled }, (_unused, index) => index + 1));

        // Never a zero, which is what an absent cell would decay into if a
        // transform copied out of an uninitialised buffer.
        expect(moved.values.includes(0), where).toBe(false);
      }
    }
  });
});
