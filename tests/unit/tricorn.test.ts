/**
 * Tricorn: one minus sign, and what it does.
 *
 * The artwork's claim is the smallest in the family — Mandelbrot Field with
 * `ci+2×zr×zi` changed to `ci-2×zr×zi` — so the source is what most of this
 * reads. A one-character difference is also the easiest to lose in an edit, which
 * is why the sign is asserted in both directions: present here, and absent in the
 * form Mandelbrot uses.
 *
 * The rest is checked against the committed fixture, which came from the live
 * service: the whole matrix recomputed in plain arithmetic, and the symmetry the
 * mathematics guarantees.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { numberAssignedTo } from '@/editor/parameterBinding';
import { fixtureToMatrix, type PresetFixture } from '@/presets/fixtures';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { tricorn } from '@/presets/tricorn';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const fixture = JSON.parse(readFileSync(join(REPO_ROOT, tricorn.fixturePath), 'utf8')) as PresetFixture;
const matrix = fixtureToMatrix(fixture);
const at = (row: number, column: number) => matrix.values[row * matrix.columns + column] as number;

describe('the conjugated sign', () => {
  it('subtracts where Mandelbrot adds', () => {
    expect(tricorn.code).toContain('(¯9⌈9⌊ci-2×zr×zi)');
    expect(mandelbrotField.code).toContain('(¯9⌈9⌊ci+2×zr×zi)');
  });

  it('does not still contain Mandelbrot’s form of the update', () => {
    /*
     * Read from the step line rather than from the whole file, because the comment
     * above it quotes Mandelbrot's version on purpose — a reader comparing the two
     * programs should not have to fetch the other one to see what changed. So the
     * assertion is about what runs: the conjugated sign, and no trace of the other
     * one left behind by a half-finished edit.
     */
    const step = tricorn.code.split('\n').find((line) => line.startsWith('step←')) ?? '';
    expect(step).not.toBe('');
    expect(step).toContain('ci-2×zr×zi');
    expect(step).not.toContain('ci+2×zr×zi');
  });

  it('changes only the imaginary half', () => {
    // The real half is Mandelbrot's, character for character. If this ever
    // diverged, the artwork would no longer be demonstrating conjugation.
    expect(tricorn.code).toContain('(¯9⌈9⌊cr+(zr*2)-zi*2)');
    expect(mandelbrotField.code).toContain('(¯9⌈9⌊cr+(zr*2)-zi*2)');
  });

  it('keeps everything else identical to Mandelbrot', () => {
    for (const shared of [
      'a←a∧4>(zr*2)+zi*2',
      'ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1',
      'ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1',
      'cr←(size,size)⍴ax',
      'ci←⍉(size,size)⍴ay',
      '⊃⌽step⍣iterations⊢(cr×0)(ci×0)((size,size)⍴1)(cr×0)',
    ]) {
      expect(tricorn.code, shared).toContain(shared);
      expect(mandelbrotField.code, shared).toContain(shared);
    }
  });

  it('names the change in the source, where a reader will meet it', () => {
    expect(tricorn.code).toContain('ci-2×zr×zi');
    expect(tricorn.code).toContain('the conjugate');
  });

  it('offers no switch for it, and only the five view controls', () => {
    expect(tricorn.parameters.map((parameter) => parameter.variable)).toEqual([
      'size',
      'iterations',
      'centreX',
      'centreY',
      'zoom',
    ]);
    for (const parameter of tricorn.parameters) {
      expect(parameter.type).not.toBe('boolean');
    }
  });

  it('is a separate program, not a variation generated from one', () => {
    expect(tricorn.id).toBe('tricorn');
    expect(tricorn.code).not.toBe(mandelbrotField.code);
    expect(readFileSync(join(REPO_ROOT, 'src/presets/apl/tricorn.apl'), 'utf8')).toContain('ci-2×zr×zi');
  });
});

describe('the committed fixture', () => {
  it('is the default full view, at the declared shape and range', () => {
    expect(matrix.rows).toBe(128);
    expect(matrix.columns).toBe(128);
    expect(numberAssignedTo(tricorn.code, 'centreX')).toBe(-0.25);
    expect(numberAssignedTo(tricorn.code, 'centreY')).toBe(0);
    expect(numberAssignedTo(tricorn.code, 'zoom')).toBe(1.5);

    const values = [...matrix.values];
    expect(Math.min(...values)).toBeGreaterThanOrEqual(tricorn.valueRange?.min ?? 1);
    expect(Math.max(...values)).toBe(numberAssignedTo(tricorn.code, 'iterations'));
  });

  it('recomputes cell for cell in plain arithmetic', () => {
    /*
     * The APL checked against the mathematics rather than against itself, and the
     * proof that the plane mapping is right: every cell, because a sample would
     * not catch a mapping that is correct along one axis and transposed along the
     * other.
     */
    const size = 128;
    const iterations = 48;
    const centreX = -0.25;
    const centreY = 0;
    const zoom = 1.5;

    const axis = (centre: number) =>
      Array.from({ length: size }, (_unused, index) => centre + zoom * (-1 + (2 * index) / (size - 1)));
    const ax = axis(centreX);
    const ay = axis(centreY);
    const clamp = (value: number) => Math.max(-9, Math.min(9, value));

    let differing = 0;
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const cr = ax[column] as number;
        const ci = ay[row] as number;
        let zr = 0;
        let zi = 0;
        let alive = 1;
        let count = 0;
        for (let step = 0; step < iterations; step += 1) {
          if (alive === 1 && !(4 > zr * zr + zi * zi)) alive = 0;
          // Minus, which is the whole artwork.
          const nextR = clamp(cr + zr * zr - zi * zi);
          const nextI = clamp(ci - 2 * zr * zi);
          zr = nextR;
          zi = nextI;
          count += alive;
        }
        if (at(row, column) !== count) differing += 1;
      }
    }

    expect(differing).toBe(0);
  });

  it('is not the Mandelbrot set at the same view', () => {
    /*
     * The same recomputation with the sign put back. If the two agreed, the minus
     * would be doing nothing and the artwork would be a duplicate of Mandelbrot
     * with a different name.
     */
    const size = 128;
    const iterations = 48;
    const zoom = 1.5;
    const axis = (centre: number) =>
      Array.from({ length: size }, (_unused, index) => centre + zoom * (-1 + (2 * index) / (size - 1)));
    const ax = axis(-0.25);
    const ay = axis(0);
    const clamp = (value: number) => Math.max(-9, Math.min(9, value));

    let differing = 0;
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const cr = ax[column] as number;
        const ci = ay[row] as number;
        let zr = 0;
        let zi = 0;
        let alive = 1;
        let count = 0;
        for (let step = 0; step < iterations; step += 1) {
          if (alive === 1 && !(4 > zr * zr + zi * zi)) alive = 0;
          const nextR = clamp(cr + zr * zr - zi * zi);
          // Plus: Mandelbrot.
          const nextI = clamp(ci + 2 * zr * zi);
          zr = nextR;
          zi = nextI;
          count += alive;
        }
        if (at(row, column) !== count) differing += 1;
      }
    }

    // A substantial part of the frame, not a handful of boundary cells.
    expect(differing / (size * size)).toBeGreaterThan(0.05);
  });

  it('holds a real picture rather than a flat wash', () => {
    const values = [...matrix.values];
    expect(new Set(values).size).toBeGreaterThan(20);

    const ceiling = values.filter((value) => value === 48).length;
    expect(ceiling / values.length).toBeGreaterThan(0.02);
    expect(ceiling / values.length).toBeLessThan(0.4);
  });
});

describe('the shape the view was chosen to show', () => {
  it('is symmetric about the real axis', () => {
    /*
     * Conjugation maps the upper half-plane onto the lower one, so the set is
     * symmetric about the real axis — and the view is centred on it, so the matrix
     * must be too. This is a property of the mathematics rather than of the
     * picture, which makes it a good check on the axis mapping: a skewed or
     * off-by-one imaginary axis would break it while still looking plausible.
     *
     * Compared row against mirrored row. The size is even, so there is no centre
     * row to skip.
     */
    let mismatched = 0;
    for (let row = 0; row < matrix.rows / 2; row += 1) {
      const mirrored = matrix.rows - 1 - row;
      for (let column = 0; column < matrix.columns; column += 1) {
        if (at(row, column) !== at(mirrored, column)) mismatched += 1;
      }
    }
    expect(mismatched).toBe(0);
  });

  it('is not symmetric about the imaginary axis', () => {
    // Which is what makes the previous test a real constraint rather than a
    // property of any matrix: this one is asymmetric left to right.
    let mismatched = 0;
    for (let row = 0; row < matrix.rows; row += 1) {
      for (let column = 0; column < matrix.columns / 2; column += 1) {
        if (at(row, column) !== at(row, matrix.columns - 1 - column)) mismatched += 1;
      }
    }
    expect(mismatched).toBeGreaterThan(0);
  });

  it('keeps the whole shape inside the frame', () => {
    // The three horns are the artwork; a border at the ceiling would mean one of
    // them is running off the edge.
    const border: number[] = [];
    for (let index = 0; index < matrix.columns; index += 1) {
      border.push(at(0, index), at(matrix.rows - 1, index));
    }
    for (let index = 0; index < matrix.rows; index += 1) {
      border.push(at(index, 0), at(index, matrix.columns - 1));
    }
    expect(border.filter((value) => value === 48)).toHaveLength(0);
  });

  it('declares the plane exploration the axes are built for', () => {
    expect(tricorn.planeExploration).toEqual({
      centreXVariable: 'centreX',
      centreYVariable: 'centreY',
      spanVariable: 'zoom',
    });
  });
});
