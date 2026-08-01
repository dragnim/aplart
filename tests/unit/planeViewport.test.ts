/**
 * Turning a dragged region into three assignments.
 *
 * The property that matters most is that the region selected is the region
 * arrived at: after a drag, the point that was in the middle of the rectangle
 * should be in the middle of the new view, and its corners should still be
 * inside. Several tests here check exactly that by mapping back through
 * `planeAt` rather than by asserting on numbers that were read off the
 * implementation.
 */

import { describe, expect, it } from 'vitest';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { type PlaneExploration } from '@/presets/schema';
import {
  panViewport,
  planeAt,
  readViewport,
  scaleViewport,
  sameViewport,
  selectionToViewport,
  viewportBounds,
  writeViewport,
  type Viewport,
  type ViewportBounds,
} from '@/workspace/planeViewport';

const SPEC: PlaneExploration = {
  centreXVariable: 'centreX',
  centreYVariable: 'centreY',
  spanVariable: 'zoom',
};

const OPEN: ViewportBounds = {
  centreX: { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY },
  centreY: { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY },
  span: { min: 0, max: Number.POSITIVE_INFINITY },
};

const START: Viewport = { centreX: -0.6, centreY: 0, span: 1.4 };

describe('planeAt', () => {
  it('puts the first column at centre minus span and the last at centre plus span', () => {
    expect(planeAt(START, 0, 0)).toEqual({ x: -2, y: -1.4 });
    // Compared loosely: -0.6 + 1.4 is not exactly 0.8 in binary floating point,
    // and pinning the exact double would be testing arithmetic, not the mapping.
    expect(planeAt(START, 1, 1).x).toBeCloseTo(0.8, 12);
    expect(planeAt(START, 1, 1).y).toBeCloseTo(1.4, 12);
    expect(planeAt(START, 0.5, 0.5)).toEqual({ x: -0.6, y: 0 });
  });
});

describe('selectionToViewport', () => {
  it('centres on the middle of the region', () => {
    const selection = { u0: 0.2, v0: 0.6, u1: 0.4, v1: 0.8 };
    const next = selectionToViewport(START, selection, OPEN);

    const wanted = planeAt(START, 0.3, 0.7);
    expect(next.centreX).toBeCloseTo(wanted.x, 6);
    expect(next.centreY).toBeCloseTo(wanted.y, 6);
  });

  it('narrows the span in proportion to the region', () => {
    // A quarter of the width is a quarter of the span.
    const next = selectionToViewport(START, { u0: 0.25, v0: 0.25, u1: 0.5, v1: 0.5 }, OPEN);
    expect(next.span).toBeCloseTo(1.4 * 0.25, 6);
  });

  it('keeps the whole region in view when it is not square', () => {
    // The taller side wins. Choosing the shorter one would crop part of what
    // was deliberately selected.
    const selection = { u0: 0.4, v0: 0.1, u1: 0.5, v1: 0.9 };
    const next = selectionToViewport(START, selection, OPEN);
    expect(next.span).toBeCloseTo(1.4 * 0.8, 6);

    // Every corner of the selection is still inside the new view.
    for (const [u, v] of [
      [0.4, 0.1],
      [0.5, 0.1],
      [0.4, 0.9],
      [0.5, 0.9],
    ] as const) {
      const point = planeAt(START, u, v);
      expect(point.x).toBeGreaterThanOrEqual(next.centreX - next.span - 1e-9);
      expect(point.x).toBeLessThanOrEqual(next.centreX + next.span + 1e-9);
      expect(point.y).toBeGreaterThanOrEqual(next.centreY - next.span - 1e-9);
      expect(point.y).toBeLessThanOrEqual(next.centreY + next.span + 1e-9);
    }
  });

  it('does not care which corner the drag started from', () => {
    const forwards = selectionToViewport(START, { u0: 0.2, v0: 0.3, u1: 0.6, v1: 0.7 }, OPEN);
    const backwards = selectionToViewport(START, { u0: 0.6, v0: 0.7, u1: 0.2, v1: 0.3 }, OPEN);
    expect(forwards).toEqual(backwards);
  });

  it('writes numbers a person could have typed', () => {
    const next = selectionToViewport(START, { u0: 0.31, v0: 0.47, u1: 0.36, v1: 0.52 }, OPEN);

    // Not centreX←¯0.6000000000000001. The code is meant to be read.
    for (const value of [next.centreX, next.centreY, next.span]) {
      expect(String(value).replace('-', '')).toMatch(/^\d+(\.\d{1,15})?$/u);
      expect(String(value)).not.toMatch(/e/iu);
    }
  });

  it('keeps enough precision to be worth zooming', () => {
    let viewport = START;
    // Ten successive zooms into the same corner region.
    for (let step = 0; step < 10; step += 1) {
      viewport = selectionToViewport(viewport, { u0: 0.4, v0: 0.4, u1: 0.6, v1: 0.6 }, OPEN);
    }
    // A view that had been rounded to a few decimals would have collapsed to
    // nothing or stopped moving several steps ago.
    expect(viewport.span).toBeGreaterThan(0);
    expect(viewport.span).toBeLessThan(1e-6);
    expect(viewport.centreX).toBeCloseTo(-0.6, 6);
  });
});

describe('bounds', () => {
  const bounds = viewportBounds(mandelbrotField.parameters, SPEC);

  it('are taken from the preset’s own controls', () => {
    expect(bounds.span.min).toBe(0.002);
    expect(bounds.span.max).toBe(2);
    expect(bounds.centreX.min).toBe(-2);
  });

  it('stop a drag producing a view the sliders would refuse to show', () => {
    // A one-pixel selection asks for a span far below the minimum.
    const next = selectionToViewport(
      { centreX: 0, centreY: 0, span: 0.01 },
      { u0: 0.5, v0: 0.5, u1: 0.505, v1: 0.505 },
      bounds,
    );
    expect(next.span).toBe(bounds.span.min);

    const readBack = readViewport(writeViewport(mandelbrotField.code, SPEC, next), SPEC);
    expect(readBack).not.toBeNull();
    expect(readBack?.span).toBe(bounds.span.min);
  });

  it('hold the centre inside the plane the controls describe', () => {
    const next = selectionToViewport(
      { centreX: 0.9, centreY: 1.1, span: 1 },
      { u0: 0.9, v0: 0.9, u1: 1, v1: 1 },
      bounds,
    );
    expect(next.centreX).toBeLessThanOrEqual(1);
    expect(next.centreY).toBeLessThanOrEqual(1.2);
  });
});

describe('scaleViewport', () => {
  it('widens about the centre, leaving it where it was', () => {
    const next = scaleViewport(START, 2, OPEN);
    expect(next).toEqual({ centreX: -0.6, centreY: 0, span: 2.8 });
  });

  it('will not widen past what the controls can show', () => {
    const next = scaleViewport(
      { centreX: 0, centreY: 0, span: 1.5 },
      2,
      viewportBounds(mandelbrotField.parameters, SPEC),
    );
    expect(next.span).toBe(2);
  });
});

describe('panViewport', () => {
  it('moves by a fraction of the current span, not a fixed amount', () => {
    // Half a span at 1.4 is 0.7; half a span at 0.002 is 0.001. A fixed step
    // that suits one is useless at the other, which is what makes this the only
    // workable way to pan without a pointer.
    expect(panViewport(START, 0.5, 0, OPEN).centreX).toBeCloseTo(-0.6 + 0.7, 6);
    expect(panViewport({ centreX: 0, centreY: 0, span: 0.002 }, 0.5, 0, OPEN).centreX).toBeCloseTo(0.001, 6);
  });

  it('leaves the span alone', () => {
    expect(panViewport(START, -0.5, 0.5, OPEN).span).toBe(1.4);
  });

  it('moves down for a positive step, matching rows running downwards', () => {
    expect(panViewport(START, 0, 0.5, OPEN).centreY).toBeCloseTo(0.7, 6);
  });

  it('stops at the edge of the plane the controls describe', () => {
    const bounds = viewportBounds(mandelbrotField.parameters, SPEC);
    let viewport: Viewport = { centreX: 0.9, centreY: 0, span: 1 };
    for (let step = 0; step < 5; step += 1) viewport = panViewport(viewport, 0.5, 0, bounds);
    expect(viewport.centreX).toBe(1);
  });
});

describe('reading and writing the code', () => {
  it('reads the preset’s own starting view', () => {
    expect(readViewport(mandelbrotField.code, SPEC)).toEqual({ centreX: -0.6, centreY: 0, span: 1.4 });
  });

  it('reads a high-bar negative as a negative', () => {
    expect(readViewport('centreX←¯1.25\ncentreY←0\nzoom←0.15', SPEC)?.centreX).toBe(-1.25);
  });

  it('writes a negative with a high bar, not a minus sign', () => {
    const written = writeViewport(mandelbrotField.code, SPEC, { centreX: -1.25, centreY: -0.02, span: 0.15 });
    expect(written).toContain('centreX←¯1.25');
    expect(written).toContain('centreY←¯0.02');
    expect(written).not.toContain('centreX←-1.25');
  });

  it('changes only the three lines it is responsible for', () => {
    const written = writeViewport(mandelbrotField.code, SPEC, { centreX: 0.1, centreY: 0.2, span: 0.3 });
    const before = mandelbrotField.code.split('\n');
    const after = written.split('\n');

    expect(after).toHaveLength(before.length);
    const changed = after.filter((line, index) => line !== before[index]);
    expect(changed).toEqual(['centreX←0.1', 'centreY←0.2', 'zoom←0.3']);
  });

  it('round-trips whatever it writes', () => {
    const viewport = { centreX: -0.743_643_9, centreY: 0.131_825_9, span: 0.004 };
    expect(readViewport(writeViewport(mandelbrotField.code, SPEC, viewport), SPEC)).toEqual(viewport);
  });

  describe('when the code no longer describes a view', () => {
    it('gives up on a missing assignment', () => {
      expect(readViewport('centreX←0\ncentreY←0', SPEC)).toBeNull();
    });

    it('gives up on an expression a number cannot be read from', () => {
      // The user has taken the line over. Overwriting it would discard their work.
      expect(readViewport('centreX←¯0.6\ncentreY←0\nzoom←2÷3', SPEC)).toBeNull();
    });

    it('gives up on a span of zero, which is not a view', () => {
      expect(readViewport('centreX←0\ncentreY←0\nzoom←0', SPEC)).toBeNull();
    });

    it('reads a view the sliders could not show', () => {
      // Deliberately more permissive than the controls: a deep zoom is still a
      // perfectly good view, and refusing it would stop the artwork responding
      // at the moment someone was getting somewhere.
      expect(readViewport('centreX←¯0.6\ncentreY←0\nzoom←0.000001', SPEC)?.span).toBe(0.000001);
    });
  });
});

describe('sameViewport', () => {
  it('is true only when nothing would change', () => {
    expect(sameViewport(START, { ...START })).toBe(true);
    expect(sameViewport(START, { ...START, span: 1.400_001 })).toBe(false);
  });
});
