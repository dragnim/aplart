/**
 * Serves TryAPL's protocol from inside the browser test.
 *
 * The end-to-end journeys must be deterministic — CI cannot fail because a
 * public service is busy — but stubbing at the network boundary rather than
 * swapping in a mock service means the real `TryAplExecutionService` is still
 * the thing under test, wire format and all. No test-only code ships.
 */

import type { Page, Route } from '@playwright/test';
import { TRYAPL_CAPABILITIES } from '@/execution/TryAplExecutionService';
import { ADAPTIVE_MARKER, formatAdaptiveReply } from '@/execution/adaptiveProbe';
import { formatBandReply } from '@/execution/transport';
import { fromNested, type NumericMatrix } from '@/matrix/matrixTypes';

export const EXEC_URL = 'https://tryapl.org/Exec';

export interface StubOptions {
  /** Milliseconds to hold the response, for exercising the loading state. */
  readonly delayMs?: number;
  /** Fail every request this way instead of answering. */
  readonly failure?: 'network' | 'server';
}

export interface StubHandle {
  /** Every expression the page has sent, in order. */
  readonly requests: string[];
}

/**
 * Evaluates the small subset of APL the presets actually use.
 *
 * `modulus|multiplier×∘.×⍨⍳size`, the Truchet hash and the Mandelbrot count —
 * between them enough to drive the whole interface, to prove a changed
 * parameter reaches the backend and changes the picture, to exercise the tile
 * renderer, which sizes its output from the matrix rather than one pixel per
 * cell, and to make a zoom actually show somewhere else.
 *
 * Returns a matrix rather than lines, because the reply has to be formatted
 * differently depending on whether the runner is probing for a shape or reading
 * a band of rows.
 */
function evaluate(expression: string): NumericMatrix | { readonly error: readonly string[] } {
  const read = (name: string): number | null => {
    const match = new RegExp(`${name}←(¯?\\d+)`, 'u').exec(expression);
    return match === null ? null : Number((match[1] as string).replace('¯', '-'));
  };

  /** As `read`, but accepts the fractional values the view assignments hold. */
  const readNumber = (name: string): number | null => {
    const match = new RegExp(`${name}←(¯?\\d+(?:\\.\\d+)?)`, 'u').exec(expression);
    return match === null ? null : Number((match[1] as string).replace('¯', '-'));
  };

  const size = read('size');
  const modulus = read('modulus');
  const multiplier = read('multiplier') ?? 1;

  /*
   * Mandelbrot Field, and Burning Ship.
   *
   * Written to follow the preset's own step function: the escape test uses the
   * values from the start of the step, both new parts are computed from the old
   * ones, and the magnitude is clamped the same way. It matters that this
   * responds to the view assignments rather than returning a fixed picture —
   * a zoom that changed nothing on screen would let a broken drag pass.
   *
   * Four artworks share one branch because they are a line apart, and they are
   * told apart the way the interpreter tells them apart: by what the step does.
   * Burning Ship takes the magnitude of each component before squaring; Tricorn
   * subtracts where Mandelbrot adds; Multibrot raises z to a declared power
   * instead of squaring it. All three declare exactly the names Mandelbrot does,
   * so without these tells they would be answered with Mandelbrot's arithmetic and
   * the artwork on screen would be the wrong fractal — the same trap `realC`
   * avoids for Julia below.
   */
  const absolute = /x←\|zr/u.test(expression);
  const conjugated = /ci-2×zr×zi/u.test(expression);
  // Two when nothing says otherwise, which is what squaring means.
  const exponent = read('power') ?? 2;
  const iterations = read('iterations');
  const centreX = readNumber('centreX');
  const centreY = readNumber('centreY');
  const zoomSpan = readNumber('zoom');

  /*
   * Julia Set.
   *
   * Recognised before Mandelbrot, and it has to be: Julia declares every name
   * Mandelbrot does, so the Mandelbrot branch below would happily answer for it
   * and the artwork on screen would be the wrong fractal. `realC` is the tell.
   *
   * Follows the preset's own program: the grid is where z begins, c is the one
   * constant, the escape test reads the values from the start of the step, and
   * the magnitude is clamped the same way.
   */
  const realC = readNumber('realC');
  const imagC = readNumber('imagC');
  if (
    size !== null &&
    size > 1 &&
    iterations !== null &&
    centreX !== null &&
    centreY !== null &&
    zoomSpan !== null &&
    realC !== null &&
    imagC !== null
  ) {
    const clamp = (value: number) => Math.max(-9, Math.min(9, value));
    const axis = (centre: number, index: number) => centre + zoomSpan * (-1 + (2 * index) / (size - 1));

    const rows: number[][] = [];
    for (let row = 0; row < size; row += 1) {
      const startI = axis(centreY, row);
      const values: number[] = [];
      for (let column = 0; column < size; column += 1) {
        let zr = axis(centreX, column);
        let zi = startI;
        let active = true;
        let count = 0;
        for (let step = 0; step < iterations; step += 1) {
          // Recorded, not re-tested: once escaped, never counted again.
          active = active && zr * zr + zi * zi < 4;
          if (active) count += 1;
          const nextR = clamp(realC + zr * zr - zi * zi);
          const nextI = clamp(imagC + 2 * zr * zi);
          zr = nextR;
          zi = nextI;
        }
        values.push(count);
      }
      rows.push(values);
    }
    return fromNested(rows);
  }

  if (
    size !== null &&
    size > 1 &&
    iterations !== null &&
    centreX !== null &&
    centreY !== null &&
    zoomSpan !== null
  ) {
    const clamp = (value: number) => Math.max(-9, Math.min(9, value));
    const axis = (centre: number, index: number) => centre + zoomSpan * (-1 + (2 * index) / (size - 1));

    const rows: number[][] = [];
    for (let row = 0; row < size; row += 1) {
      const ci = axis(centreY, row);
      const values: number[] = [];
      for (let column = 0; column < size; column += 1) {
        const cr = axis(centreX, column);
        let zr = 0;
        let zi = 0;
        let count = 0;
        for (let step = 0; step < iterations; step += 1) {
          if (zr * zr + zi * zi < 4) count += 1;
          // Burning Ship's one difference, taken from the source rather than
          // from a preset id, exactly as the interpreter would see it.
          const x = absolute ? Math.abs(zr) : zr;
          const y = absolute ? Math.abs(zi) : zi;

          // (x + iy) raised to the exponent, by repeated multiplication, which is
          // what the APL does. At the default exponent of two this is one
          // multiplication and exactly the square the other three artworks use.
          let wr = x;
          let wi = y;
          for (let again = 1; again < exponent; again += 1) {
            const nr = wr * x - wi * y;
            const ni = wr * y + wi * x;
            wr = nr;
            wi = ni;
          }

          const nextR = clamp(cr + wr);
          // Tricorn's one difference, again taken from the source rather than from
          // a preset id.
          const nextI = clamp(conjugated ? ci - wi : ci + wi);
          zr = nextR;
          zi = nextI;
        }
        values.push(count);
      }
      rows.push(values);
    }
    return fromNested(rows);
  }

  /*
   * Truchet Grid.
   *
   *   angle←(12.9898×⍳size)∘.+(78.233×⍳size)+seed×0.6180339887
   *   classes|⌊classes×1|43758.5453×1○angle
   *
   * The last bits of `sin` need not match the interpreter's for these tests,
   * which check shapes and dimensions rather than individual tiles.
   */
  const classes = read('classes');
  const seed = read('seed');
  if (size !== null && classes !== null && classes !== 0 && seed !== null) {
    const offset = seed * 0.618_033_988_7;
    const rows: number[][] = [];
    for (let row = 1; row <= size; row += 1) {
      const values: number[] = [];
      for (let column = 1; column <= size; column += 1) {
        const hashed = 43_758.5453 * Math.sin(12.9898 * row + 78.233 * column + offset);
        values.push(Math.floor(classes * (hashed - Math.floor(hashed))) % classes);
      }
      rows.push(values);
    }
    return fromNested(rows);
  }

  /*
   * Checker Shift.
   *
   *   repeat|(⍳size)∘.+offset×⍳size
   *
   * Row plus a sheared column, folded by the repeat. Answered here because
   * "Start creating" draws from four artworks now, and an artwork this stub
   * cannot evaluate arrives as a VALUE ERROR — which would make the journey
   * spec pass or fail depending on which one the seed happened to choose.
   */
  const repeat = read('repeat');
  const offset = read('offset');
  if (size !== null && repeat !== null && repeat !== 0 && offset !== null) {
    const rows: number[][] = [];
    for (let row = 1; row <= size; row += 1) {
      const values: number[] = [];
      for (let column = 1; column <= size; column += 1) {
        values.push((row + offset * column) % repeat);
      }
      rows.push(values);
    }
    return fromNested(rows);
  }

  /*
   * Wave Interference.
   *
   *   angles←○(¯1+⍳symmetry)÷symmetry
   *   ⌊0.5+100×⊃+/(1○phase+○2×frequency×((2○angles)×⊂X)+(1○angles)×⊂Y)
   *
   * One straight wave per direction, summed. Follows the preset's own
   * arithmetic rather than returning a fixed picture, so that changing the
   * frequency or the symmetry genuinely changes what comes back.
   */
  const frequency = read('frequency');
  const symmetry = read('symmetry');
  if (size !== null && frequency !== null && symmetry !== null && symmetry !== 0) {
    const phase = readNumber('phase') ?? 0;
    const angles = Array.from({ length: symmetry }, (_unused, index) => (Math.PI * index) / symmetry);

    const rows: number[][] = [];
    for (let row = 1; row <= size; row += 1) {
      const y = (row - 1) / size;
      const values: number[] = [];
      for (let column = 1; column <= size; column += 1) {
        const x = (column - 1) / size;
        let total = 0;
        for (const angle of angles) {
          total += Math.sin(phase + 2 * Math.PI * frequency * (Math.cos(angle) * x + Math.sin(angle) * y));
        }
        values.push(Math.floor(0.5 + 100 * total));
      }
      rows.push(values);
    }
    return fromNested(rows);
  }

  if (size === null || modulus === null) {
    return { error: ['VALUE ERROR: Undefined name: size', ` ${expression}`, '  ∧'] };
  }
  if (modulus === 0) {
    return { error: ['DOMAIN ERROR', ` ${expression}`, '  ∧'] };
  }

  const rows: number[][] = [];
  for (let row = 1; row <= size; row += 1) {
    const values: number[] = [];
    for (let column = 1; column <= size; column += 1) {
      values.push((multiplier * row * column) % modulus);
    }
    rows.push(values);
  }
  return fromNested(rows);
}

/**
 * Formats a reply the way the backend would.
 *
 * The first request either carries the whole artwork or reports what would not
 * fit, and the same helpers the in-process mock uses are reused here so the two
 * cannot disagree about the wire format — including about which results are
 * small enough to arrive in one reply.
 */
function reply(expression: string): readonly string[] {
  const evaluated = evaluate(expression);
  if ('error' in evaluated) return evaluated.error;

  return expression.includes(ADAPTIVE_MARKER)
    ? formatAdaptiveReply(evaluated, TRYAPL_CAPABILITIES)
    : formatBandReply(evaluated, expression, TRYAPL_CAPABILITIES);
}

export async function stubTryApl(page: Page, options: StubOptions = {}): Promise<StubHandle> {
  const requests: string[] = [];

  await page.route(EXEC_URL, async (route: Route) => {
    const body = route.request().postDataJSON() as unknown;
    const expression = Array.isArray(body) && typeof body[3] === 'string' ? body[3] : '';
    requests.push(expression);

    if (options.delayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }

    if (options.failure === 'network') {
      await route.abort('failed');
      return;
    }
    if (options.failure === 'server') {
      await route.fulfill({ status: 503, body: 'unavailable' });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(['state-blob', 4834, 'blob', reply(expression)]),
    });
  });

  return { requests };
}
