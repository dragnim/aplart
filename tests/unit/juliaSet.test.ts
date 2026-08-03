/**
 * Julia Set: what makes it a Julia set, and what it must not become.
 *
 * The artwork's whole educational claim is that it differs from Mandelbrot Field
 * by two exchanges of role — the grid becomes where z begins, and c becomes one
 * constant shared by every point — and that both are visible in the source. So
 * the source is what these read, not a rendered picture.
 *
 * The rest guards the boundary the two programs must keep. They are separate
 * files on purpose. Nothing here should ever grow into a shared formula builder:
 * the resemblance is the lesson, and a generator would hide it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { numberAssignedTo } from '@/editor/parameterBinding';
import { fixtureToMatrix, type PresetFixture } from '@/presets/fixtures';
import { juliaSet } from '@/presets/julia-set';
import { mandelbrotField } from '@/presets/mandelbrot-field';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const fixture = JSON.parse(readFileSync(join(REPO_ROOT, juliaSet.fixturePath), 'utf8')) as PresetFixture;

describe('the two changes from Mandelbrot', () => {
  it('starts z at the grid rather than at zero', () => {
    /*
     * Mandelbrot's last line seeds z with `(cr×0)(ci×0)` — zero everywhere.
     * Julia seeds it with the grid itself. That single difference is what turns
     * one picture into a family of them.
     */
    expect(juliaSet.code).toContain('startR←(size,size)⍴ax');
    expect(juliaSet.code).toContain('startI←⍉(size,size)⍴ay');
    expect(juliaSet.code).toContain('⊃⌽step⍣iterations⊢startR startI((size,size)⍴1)(startR×0)');

    expect(mandelbrotField.code).toContain('⊃⌽step⍣iterations⊢(cr×0)(ci×0)((size,size)⍴1)(cr×0)');
  });

  it('takes c from one constant rather than from the grid', () => {
    expect(juliaSet.code).toContain('realC←¯0.8');
    expect(juliaSet.code).toContain('imagC←0.156');
    expect(juliaSet.code).toContain('(¯9⌈9⌊realC+(zr*2)-zi*2)(¯9⌈9⌊imagC+2×zr×zi)');

    // And the grid is no longer called c at all, which is the point of renaming
    // it: `cr` and `ci` would still have run, and would have read as a lie.
    expect(juliaSet.code).not.toContain('cr←');
    expect(juliaSet.code).not.toContain('ci←');
  });

  it('names both changes in the source, where a reader will meet them', () => {
    // The comments are part of the artwork. Somebody comparing the two files
    // should not have to infer what swapped.
    expect(juliaSet.code).toContain('the grid is where z begins');
    expect(juliaSet.code).toContain('c is one constant shared by every point');
  });

  it('keeps everything else identical to Mandelbrot', () => {
    /*
     * Same escape test before the update, same latch, same clamp, same axes.
     * If these ever diverge the comparison stops teaching anything, because a
     * reader could no longer attribute the difference in the picture to the two
     * lines that were meant to cause it.
     */
    for (const shared of [
      'a←a∧4>(zr*2)+zi*2',
      '(¯9⌈9⌊',
      'ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1',
      'ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1',
    ]) {
      expect(juliaSet.code, shared).toContain(shared);
      expect(mandelbrotField.code, shared).toContain(shared);
    }
  });

  it('is a separate program, not a variation generated from one', () => {
    // Two files, two ids, no shared builder. Asserted because the temptation to
    // factor them together will only grow as more of this family arrives.
    expect(juliaSet.id).toBe('julia-set');
    expect(juliaSet.code).not.toBe(mandelbrotField.code);
    expect(readFileSync(join(REPO_ROOT, 'src/presets/apl/julia-set.apl'), 'utf8')).toContain('realC');
  });
});

describe('the controls', () => {
  const parameter = (variable: string) =>
    juliaSet.parameters.find((candidate) => candidate.variable === variable);

  it('offers both parts of c as ordinary numbers', () => {
    // Two numeric controls, not a complex-number widget and not a picker of
    // interesting values — the interesting values are found by moving these.
    for (const [variable, label, value] of [
      ['realC', 'Real part of c', -0.8],
      ['imagC', 'Imaginary part of c', 0.156],
    ] as const) {
      expect(parameter(variable)?.type, variable).toBe('number');
      expect(parameter(variable)?.label, variable).toBe(label);
      expect(parameter(variable)?.defaultValue, variable).toBe(value);
      expect(numberAssignedTo(juliaSet.code, variable), variable).toBe(value);
    }
  });

  it('keeps the shared names, so exploration needs no new abstraction', () => {
    for (const variable of ['size', 'iterations', 'centreX', 'centreY', 'zoom']) {
      expect(parameter(variable), variable).toBeDefined();
      expect(numberAssignedTo(juliaSet.code, variable), variable).not.toBeNull();
    }
    expect(parameter('iterations')?.defaultValue).toBe(48);
    expect(parameter('iterations')?.max).toBe(60);
    expect(parameter('size')?.max).toBe(144);
  });

  it('leaves the Julia constant out of plane exploration entirely', () => {
    /*
     * The strongest form of "dragging cannot change which set you are looking
     * at": the two variables are simply not among the three it is allowed to
     * rewrite.
     */
    const exploration = juliaSet.planeExploration;
    expect(exploration).toBeDefined();
    const rewritable = [
      exploration?.centreXVariable,
      exploration?.centreYVariable,
      exploration?.spanVariable,
    ];
    expect(rewritable).toEqual(['centreX', 'centreY', 'zoom']);
    expect(rewritable).not.toContain('realC');
    expect(rewritable).not.toContain('imagC');
  });
});

describe('the span limit', () => {
  it('stops where a point would start outside the escape radius', () => {
    /*
     * This is the one place Julia cannot simply copy Mandelbrot's ranges, and
     * the reason is arithmetic rather than taste. The count adds one for each
     * step a point survives the test, and the test runs before the update — so
     * Mandelbrot's first test is on z = 0 and always passes. A Julia point
     * starts at its own coordinate, so a corner further than 2 from the origin
     * has escaped before the first step and returns zero, below the declared
     * minimum of one.
     *
     * Verified against the live service at the limit: a span of 1.4 returns
     * 1..48 with no zero in it.
     */
    const span = juliaSet.parameters.find((candidate) => candidate.variable === 'zoom');
    const limit = span?.max ?? 0;

    // The furthest a cell can start from the origin is the corner of the frame.
    const corner = Math.hypot(limit, limit);
    expect(corner).toBeLessThan(2);

    // And the default sits inside that limit.
    expect(span?.defaultValue).toBe(1.3);
    expect(limit).toBeLessThanOrEqual(1.4);
  });

  it('declares the range the program actually returns', () => {
    expect(juliaSet.valueRange).toEqual({ min: 1, maxVariable: 'iterations' });
  });
});

describe('the committed fixture', () => {
  it('is the default view, at the declared shape and range', () => {
    const matrix = fixtureToMatrix(fixture);
    expect(matrix.rows).toBe(128);
    expect(matrix.columns).toBe(128);

    const values = [...matrix.values];
    expect(Math.min(...values)).toBe(1);
    expect(Math.max(...values)).toBe(48);
    for (const value of values) expect(Number.isInteger(value)).toBe(true);
  });

  it('holds a real picture rather than a flat wash', () => {
    // 48 distinct counts, so the colouring has something to work with — the
    // failing case that decided Mandelbrot's own ceiling.
    const values = [...fixtureToMatrix(fixture).values];
    expect(new Set(values).size).toBe(48);

    const atCeiling = values.filter((value) => value === 48).length / values.length;
    expect(atCeiling).toBeGreaterThan(0.05);
    expect(atCeiling).toBeLessThan(0.5);
  });
});

describe('what the inspector may say', () => {
  it('never claims a point is in the set', () => {
    /*
     * A count that reached the ceiling proves nothing: a point that would have
     * escaped on the next step is indistinguishable from one that never
     * escapes. For a Julia set that is not a quibble — the boundary is where
     * the interesting points are.
     */
    const notes = juliaSet.valueNotes;
    expect(notes?.cellAtCeiling).toBe('This point did not escape within {ceiling} iterations.');

    const sentences = [notes?.cellAtCeiling ?? '', notes?.viewAtCeiling ?? ''];
    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/in the (julia )?set|inside the set|is a member|belongs to/iu);
    }
  });

  it('reads the ceiling from the code rather than assuming it', () => {
    expect(juliaSet.valueNotes?.ceilingVariable).toBe('iterations');
  });
});
