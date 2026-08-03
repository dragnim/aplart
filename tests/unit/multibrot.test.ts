/**
 * Multibrot: the exponent, and what it is allowed to be.
 *
 * The artwork's claim is that the square in Mandelbrot's step has become a
 * control, so these read the source for the exponent and then check the two ends
 * of it: at two the program must be Mandelbrot exactly, and at three it must not.
 *
 * The rest is about the control itself. An exponent is the first parameter in this
 * project where a wrong value is not merely unhelpful but meaningless — `⍣2.5` is
 * not half an application — so what happens to a non-integer or an out-of-range
 * value is part of the artwork's correctness rather than a detail of the interface.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bindingStateFor, numberAssignedTo, setParameterValue } from '@/editor/parameterBinding';
import { fixtureToMatrix, type PresetFixture } from '@/presets/fixtures';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { multibrot } from '@/presets/multibrot';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const fixture = JSON.parse(readFileSync(join(REPO_ROOT, multibrot.fixturePath), 'utf8')) as PresetFixture;
const matrix = fixtureToMatrix(fixture);
const at = (row: number, column: number) => matrix.values[row * matrix.columns + column] as number;

const powerParameter = multibrot.parameters.find((parameter) => parameter.variable === 'power');

/**
 * The iteration, in plain arithmetic, for any integer exponent.
 *
 * Written as repeated multiplication because that is what the APL does: the point
 * of recomputing it here is to check the program against the mathematics, so the
 * two have to agree about the method as well as the answer.
 */
function counts(power: number, size: number, centreX: number, centreY: number, zoom: number, ceiling = 48) {
  const axis = (centre: number) =>
    Array.from({ length: size }, (_unused, index) => centre + zoom * (-1 + (2 * index) / (size - 1)));
  const ax = axis(centreX);
  const ay = axis(centreY);
  const clamp = (value: number) => Math.max(-9, Math.min(9, value));

  const out = new Int32Array(size * size);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const cr = ax[column] as number;
      const ci = ay[row] as number;
      let zr = 0;
      let zi = 0;
      let alive = 1;
      let count = 0;
      for (let step = 0; step < ceiling; step += 1) {
        if (alive === 1 && !(4 > zr * zr + zi * zi)) alive = 0;

        // z multiplied by itself power-1 times, which is z*power.
        let wr = zr;
        let wi = zi;
        for (let again = 1; again < power; again += 1) {
          const nextR = wr * zr - wi * zi;
          const nextI = wr * zi + wi * zr;
          wr = nextR;
          wi = nextI;
        }

        zr = clamp(cr + wr);
        zi = clamp(ci + wi);
        count += alive;
      }
      out[row * size + column] = count;
    }
  }
  return out;
}

describe('the exponent in the program', () => {
  it('is a control, applied by the power operator', () => {
    expect(multibrot.code).toContain('power←3');
    expect(multibrot.code).toContain('by⍣(power-1)');
  });

  it('multiplies z by itself, written out because there are no complex numbers', () => {
    expect(multibrot.code).toContain('by←{(mr mi)←⍺ ⋄ (pr pi)←⍵ ⋄ ((pr×mr)-pi×mi)((pr×mi)+pi×mr)}');
  });

  it('has no square written into the step at all', () => {
    /*
     * Mandelbrot's update is `cr+(zr*2)-zi*2`. This program must not contain it:
     * the exponent is the artwork, so a hard-coded square anywhere in the step
     * would mean the control is decorative.
     */
    const step = multibrot.code.split('\n').find((line) => line.startsWith('step←')) ?? '';
    expect(step).not.toBe('');
    expect(step).toContain('(wr wi)←(zr zi)(by⍣(power-1))zr zi');
    expect(step).not.toContain('cr+(zr*2)-zi*2');
    expect(mandelbrotField.code).toContain('cr+(zr*2)-zi*2');
  });

  it('keeps the rest of Mandelbrot untouched', () => {
    for (const shared of [
      'a←a∧4>(zr*2)+zi*2',
      'ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1',
      'ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1',
      'cr←(size,size)⍴ax',
      'ci←⍉(size,size)⍴ay',
      '⊃⌽step⍣iterations⊢(cr×0)(ci×0)((size,size)⍴1)(cr×0)',
    ]) {
      expect(multibrot.code, shared).toContain(shared);
      expect(mandelbrotField.code, shared).toContain(shared);
    }
  });
});

describe('the exponent as a control', () => {
  it('is a whole number from two to eight', () => {
    expect(powerParameter).toBeDefined();
    expect(powerParameter?.type).toBe('integer');
    expect(powerParameter?.min).toBe(2);
    expect(powerParameter?.max).toBe(8);
    expect(powerParameter?.step).toBe(1);
    expect(powerParameter?.defaultValue).toBe(3);
  });

  it('refuses a fractional exponent rather than rounding it', () => {
    /*
     * `⍣2.5` is not half an application, so there is nothing sensible to run. The
     * binder reports the assignment as unrepresentable, which detaches the slider
     * and leaves the source alone — the safe failure. Clamping would be the unsafe
     * one: it would rewrite code somebody deliberately typed.
     */
    const source = multibrot.code.replace('power←3', 'power←2.5');
    expect(bindingStateFor(source, powerParameter!).status).toBe('unrepresentable');
    expect(source).toContain('power←2.5');
  });

  it('refuses an exponent outside the supported range, in both directions', () => {
    for (const outside of ['power←1', 'power←9', 'power←¯3', 'power←100']) {
      const source = multibrot.code.replace('power←3', outside);
      expect(bindingStateFor(source, powerParameter!).status, outside).toBe('unrepresentable');
      // And the code is left exactly as written, not corrected towards the range.
      expect(source).toContain(outside);
    }
  });

  it('accepts every supported exponent', () => {
    for (const power of [2, 3, 4, 5, 6, 7, 8]) {
      const source = multibrot.code.replace('power←3', `power←${String(power)}`);
      expect(bindingStateFor(source, powerParameter!), String(power)).toMatchObject({
        status: 'bound',
        value: power,
      });
    }
  });

  it('changes only its own line when set', () => {
    /*
     * The requirement that moving the exponent must not silently alter the centre,
     * the span, the resolution or the iteration ceiling. Asserted line by line
     * rather than by eye, because a rewrite that touched a neighbour would be
     * invisible until somebody compared two shared links.
     */
    const result = setParameterValue(multibrot.code, 'power', 5);
    expect(result.ok).toBe(true);
    const updated = result.ok ? result.code : '';

    const before = multibrot.code.split('\n');
    const after = updated.split('\n');
    expect(after).toHaveLength(before.length);

    const changed = before
      .map((line, index) => ({ line, after: after[index] ?? '', index }))
      .filter((pair) => pair.line !== pair.after);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.line).toBe('power←3');
    expect(changed[0]?.after).toBe('power←5');

    // And every other control still reads what it read.
    for (const [variable, value] of [
      ['size', 128],
      ['iterations', 48],
      ['centreX', 0],
      ['centreY', 0],
      ['zoom', 1.4],
    ] as const) {
      expect(numberAssignedTo(updated, variable), variable).toBe(value);
    }
  });

  it('is not part of plane exploration', () => {
    // Dragging changes where you are looking, never which shape you are looking at.
    expect(multibrot.planeExploration).toEqual({
      centreXVariable: 'centreX',
      centreYVariable: 'centreY',
      spanVariable: 'zoom',
    });
    expect(JSON.stringify(multibrot.planeExploration)).not.toContain('power');
  });
});

describe('the committed fixture', () => {
  it('is the default view at the default exponent', () => {
    expect(matrix.rows).toBe(128);
    expect(matrix.columns).toBe(128);
    expect(numberAssignedTo(multibrot.code, 'power')).toBe(3);
    expect(numberAssignedTo(multibrot.code, 'centreX')).toBe(0);
    expect(numberAssignedTo(multibrot.code, 'centreY')).toBe(0);
    expect(numberAssignedTo(multibrot.code, 'zoom')).toBe(1.4);
  });

  it('recomputes cell for cell in plain arithmetic', () => {
    const expected = counts(3, 128, 0, 0, 1.4);
    let differing = 0;
    for (let row = 0; row < 128; row += 1) {
      for (let column = 0; column < 128; column += 1) {
        if (at(row, column) !== expected[row * 128 + column]) differing += 1;
      }
    }
    expect(differing).toBe(0);
  });

  it('is symmetric about the real axis, as every integer power is', () => {
    let mismatched = 0;
    for (let row = 0; row < matrix.rows / 2; row += 1) {
      for (let column = 0; column < matrix.columns; column += 1) {
        if (at(row, column) !== at(matrix.rows - 1 - row, column)) mismatched += 1;
      }
    }
    expect(mismatched).toBe(0);
  });

  it('holds a real picture rather than a flat wash', () => {
    const values = [...matrix.values];
    expect(new Set(values).size).toBeGreaterThan(20);
    const ceiling = values.filter((value) => value === 48).length;
    expect(ceiling / values.length).toBeGreaterThan(0.05);
    expect(ceiling / values.length).toBeLessThan(0.45);
  });
});

describe('the two ends of the exponent', () => {
  it('is Mandelbrot exactly at power two', () => {
    /*
     * Recomputed rather than compared against a fixture, so this states the
     * mathematical claim: multiplying z by itself once is squaring it. The live
     * suite makes the same comparison against the real interpreter, which is where
     * a difference in floating-point behaviour would show up.
     */
    const squared = counts(2, 64, -0.6, 0, 1.4);

    const axis = (centre: number) =>
      Array.from({ length: 64 }, (_unused, index) => centre + 1.4 * (-1 + (2 * index) / 63));
    const ax = axis(-0.6);
    const ay = axis(0);
    const clamp = (value: number) => Math.max(-9, Math.min(9, value));

    let differing = 0;
    for (let row = 0; row < 64; row += 1) {
      for (let column = 0; column < 64; column += 1) {
        const cr = ax[column] as number;
        const ci = ay[row] as number;
        let zr = 0;
        let zi = 0;
        let alive = 1;
        let count = 0;
        for (let step = 0; step < 48; step += 1) {
          if (alive === 1 && !(4 > zr * zr + zi * zi)) alive = 0;
          // Mandelbrot's own form of the update.
          const nextR = clamp(cr + zr * zr - zi * zi);
          const nextI = clamp(ci + 2 * zr * zi);
          zr = nextR;
          zi = nextI;
          count += alive;
        }
        if (squared[row * 64 + column] !== count) differing += 1;
      }
    }
    expect(differing).toBe(0);
  });

  it('is not Mandelbrot at power three', () => {
    const cubed = counts(3, 64, -0.6, 0, 1.4);
    const squared = counts(2, 64, -0.6, 0, 1.4);

    let differing = 0;
    for (let index = 0; index < cubed.length; index += 1) {
      if (cubed[index] !== squared[index]) differing += 1;
    }
    expect(differing / cubed.length).toBeGreaterThan(0.1);
  });
});
