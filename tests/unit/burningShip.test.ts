/**
 * Burning Ship: the absolute values, and the picture they make.
 *
 * The artwork's claim is narrow and checkable — it is Mandelbrot Field with each
 * component made positive before it is squared — so most of this reads the source
 * rather than a rendered image. What the source cannot establish is that the
 * result is the shape the default view promises, and that is checked against the
 * committed fixture: the mathematics recomputed independently, and the ship found
 * where a ship should be.
 *
 * The two programs are separate files on purpose. Nothing here should grow into a
 * shared formula builder with a flag for absolute values — the resemblance is the
 * lesson, and a generator would hide it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { numberAssignedTo } from '@/editor/parameterBinding';
import { fixtureToMatrix, type PresetFixture } from '@/presets/fixtures';
import { burningShip } from '@/presets/burning-ship';
import { mandelbrotField } from '@/presets/mandelbrot-field';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const fixture = JSON.parse(readFileSync(join(REPO_ROOT, burningShip.fixturePath), 'utf8')) as PresetFixture;
const matrix = fixtureToMatrix(fixture);
const at = (row: number, column: number) => matrix.values[row * matrix.columns + column] as number;

describe('the one change from Mandelbrot', () => {
  it('makes each component positive before squaring it', () => {
    // Named assignments on the step line, then used in place of zr and zi in the
    // update. Both halves matter: naming them without using them would change
    // nothing, and using |zr inline would hide the difference in the arithmetic.
    expect(burningShip.code).toContain('x←|zr');
    expect(burningShip.code).toContain('y←|zi');
    expect(burningShip.code).toContain('(¯9⌈9⌊cr+(x*2)-y*2)(¯9⌈9⌊ci+2×x×y)');
  });

  it('puts the absolute values before the squaring, not after', () => {
    /*
     * Order is the whole substance of the artwork, so it is asserted as an order
     * and not as the presence of two glyphs. `x←|zr` must appear earlier in the
     * step line than the squaring that consumes it.
     */
    const step = burningShip.code.split('\n').find((line) => line.startsWith('step←')) ?? '';
    expect(step).not.toBe('');

    const absolute = step.indexOf('x←|zr');
    const squaring = step.indexOf('(x*2)-y*2');
    expect(absolute).toBeGreaterThan(-1);
    expect(squaring).toBeGreaterThan(-1);
    expect(absolute).toBeLessThan(squaring);
  });

  it('squares the positive components and nothing else', () => {
    // Mandelbrot's update, which this must no longer contain: squaring zr and zi
    // directly is the thing the absolute values replace.
    expect(mandelbrotField.code).toContain('(¯9⌈9⌊cr+(zr*2)-zi*2)');
    expect(burningShip.code).not.toContain('cr+(zr*2)-zi*2');
    expect(burningShip.code).not.toContain('ci+2×zr×zi');
  });

  it('keeps everything else identical to Mandelbrot', () => {
    /*
     * Same escape test before the update, same latch, same clamp, same axes, same
     * seed of zero. If these diverge the comparison stops teaching anything: a
     * reader could no longer attribute the difference in the picture to the two
     * lines meant to cause it.
     */
    for (const shared of [
      'a←a∧4>(zr*2)+zi*2',
      '(¯9⌈9⌊',
      'ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1',
      'ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1',
      'cr←(size,size)⍴ax',
      'ci←⍉(size,size)⍴ay',
      '⊃⌽step⍣iterations⊢(cr×0)(ci×0)((size,size)⍴1)(cr×0)',
    ]) {
      expect(burningShip.code, shared).toContain(shared);
      expect(mandelbrotField.code, shared).toContain(shared);
    }
  });

  it('names the change in the source, where a reader will meet it', () => {
    // The comment is part of the artwork. Somebody comparing the two files
    // should not have to infer which line does the work.
    expect(burningShip.code).toContain('positive before it is squared');
  });

  it('offers no switch for the absolute values', () => {
    /*
     * Editing the source is how they come off, which is the application's whole
     * premise. A checkbox would turn the lesson into a setting and would need a
     * second, hidden version of the formula to implement.
     */
    for (const parameter of burningShip.parameters) {
      expect(parameter.type).not.toBe('boolean');
    }
    expect(burningShip.parameters.map((parameter) => parameter.variable)).toEqual([
      'size',
      'iterations',
      'centreX',
      'centreY',
      'zoom',
    ]);
  });

  it('is a separate program, not a variation generated from one', () => {
    expect(burningShip.id).toBe('burning-ship');
    expect(burningShip.code).not.toBe(mandelbrotField.code);
    expect(readFileSync(join(REPO_ROOT, 'src/presets/apl/burning-ship.apl'), 'utf8')).toContain('x←|zr');
  });
});

describe('the committed fixture', () => {
  it('is the default view, at the declared shape and range', () => {
    expect(matrix.rows).toBe(128);
    expect(matrix.columns).toBe(128);
    expect(numberAssignedTo(burningShip.code, 'centreX')).toBe(-1.755);
    expect(numberAssignedTo(burningShip.code, 'centreY')).toBe(-0.02);
    expect(numberAssignedTo(burningShip.code, 'zoom')).toBe(0.06);

    // Inside the declared range, and reaching the ceiling the code names.
    const values = [...matrix.values];
    expect(Math.min(...values)).toBeGreaterThanOrEqual(burningShip.valueRange?.min ?? 1);
    expect(Math.max(...values)).toBe(numberAssignedTo(burningShip.code, 'iterations'));
  });

  it('recomputes cell for cell in plain arithmetic', () => {
    /*
     * The APL checked against the mathematics rather than against itself. The
     * same iteration, written out here in JavaScript: absolute values, the clamp,
     * and the latch that stops a returned point being counted again.
     *
     * Every cell, because a sample would not catch a mapping that is right along
     * one axis and transposed along the other.
     */
    const size = 128;
    const iterations = 48;
    const centreX = -1.755;
    const centreY = -0.02;
    const zoom = 0.06;

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
          const x = Math.abs(zr);
          const y = Math.abs(zi);
          zr = clamp(cr + x * x - y * y);
          zi = clamp(ci + 2 * x * y);
          count += alive;
        }
        if (at(row, column) !== count) differing += 1;
      }
    }

    expect(differing).toBe(0);
  });

  it('holds a real picture rather than a flat wash', () => {
    const values = [...matrix.values];
    expect(new Set(values).size).toBeGreaterThan(20);

    // The hull is at the ceiling and is a minority of the frame. All of it would
    // mean the view is inside the shape; none would mean the shape is elsewhere.
    const ceiling = values.filter((value) => value === 48).length;
    expect(ceiling / values.length).toBeGreaterThan(0.02);
    expect(ceiling / values.length).toBeLessThan(0.4);
  });
});

describe('the plane mapping and the orientation', () => {
  /**
   * Where the ceiling cells sit, as a fraction of the frame.
   *
   * The hull is the solid mass that never escaped, so its position is a
   * measurement of the orientation: a ship the wrong way up would put it at the
   * top with the masts hanging below.
   */
  const centre = () => {
    let rows = 0;
    let columns = 0;
    let found = 0;
    for (let row = 0; row < matrix.rows; row += 1) {
      for (let column = 0; column < matrix.columns; column += 1) {
        if (at(row, column) !== 48) continue;
        rows += row;
        columns += column;
        found += 1;
      }
    }
    return { row: rows / found / matrix.rows, column: columns / found / matrix.columns, found };
  };

  it('puts the hull below the masts, from the axis lines alone', () => {
    /*
     * The imaginary axis increases down the rows — `ci←⍉(size,size)⍴ay` with `ay`
     * ascending — so the hull ends up in the lower half because that is where the
     * arithmetic puts it, not because anything flips the image. This test is what
     * would fail if a renderer ever started correcting the orientation.
     */
    const { row, found } = centre();
    expect(found).toBeGreaterThan(50);
    expect(row).toBeGreaterThan(0.5);
  });

  it('has more escaping sky above the shape than below it', () => {
    // The masts thin out upwards into fast escapes; below the hull is the
    // waterline and then the flat exterior. Read as row means, the top of the
    // frame must be the cheaper half.
    const rowMean = (row: number) => {
      let total = 0;
      for (let column = 0; column < matrix.columns; column += 1) total += at(row, column);
      return total / matrix.columns;
    };

    const top = rowMean(2);
    const middle = rowMean(Math.floor(matrix.rows / 2));
    expect(top).toBeLessThan(middle);
  });

  it('maps the same axis lines the exploration declaration promises', () => {
    // Drag-to-zoom rewrites these three assignments and nothing else, which is
    // only sound because the axes are built from exactly these names.
    expect(burningShip.planeExploration).toEqual({
      centreXVariable: 'centreX',
      centreYVariable: 'centreY',
      spanVariable: 'zoom',
    });
    expect(burningShip.code).toContain('ax←centreX+zoom×');
    expect(burningShip.code).toContain('ay←centreY+zoom×');
  });

  it('leaves the shape inside the frame at the default span', () => {
    /*
     * The framing was chosen by looking at four candidates; this is the part of
     * that judgement a test can keep. The border must not be at the ceiling — a
     * hull running off the edge would mean the view had drifted or the span had
     * been narrowed past the vessel.
     */
    const border: number[] = [];
    for (let index = 0; index < matrix.columns; index += 1) {
      border.push(at(0, index), at(matrix.rows - 1, index));
    }
    for (let index = 0; index < matrix.rows; index += 1) {
      border.push(at(index, 0), at(index, matrix.columns - 1));
    }
    expect(border.filter((value) => value === 48)).toHaveLength(0);
  });
});
