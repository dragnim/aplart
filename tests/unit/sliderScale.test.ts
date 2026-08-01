/**
 * The geometric slider scale.
 *
 * This exists because of one concrete failure: the span control ran from 0.002
 * to 2 with a step of 0.05, so its valid stops were 0.002, 0.052, 0.102 and so
 * on. A view chosen by dragging on the artwork — say 0.0137 — was one arrow key
 * away from becoming 0.052, which is not a nudge but a different piece of the
 * plane. The tests below are mostly about that not happening again.
 */

import { describe, expect, it } from 'vitest';
import { LOG_SLIDER_POSITIONS, fromSliderPosition, toSliderPosition } from '@/workspace/sliderScale';

const MIN = 0.002;
const MAX = 2;

describe('the geometric slider scale', () => {
  it('puts the declared limits at the ends, exactly', () => {
    expect(toSliderPosition(MIN, MIN, MAX)).toBe(0);
    expect(toSliderPosition(MAX, MIN, MAX)).toBe(LOG_SLIDER_POSITIONS);
    // Exactly, not to three figures: dragging to an end must give the limit.
    expect(fromSliderPosition(0, MIN, MAX)).toBe(MIN);
    expect(fromSliderPosition(LOG_SLIDER_POSITIONS, MIN, MAX)).toBe(MAX);
  });

  it('puts the geometric middle in the middle', () => {
    const middle = fromSliderPosition(LOG_SLIDER_POSITIONS / 2, MIN, MAX);
    expect(middle).toBeCloseTo(Math.sqrt(MIN * MAX), 3);
  });

  it('round-trips a value through a position', () => {
    for (const value of [0.002, 0.0137, 0.05, 0.308, 1.4, 2]) {
      const back = fromSliderPosition(toSliderPosition(value, MIN, MAX), MIN, MAX);
      // Within one step, which is all a two-hundred-stop slider can promise.
      expect(back / value).toBeGreaterThan(0.97);
      expect(back / value).toBeLessThan(1.03);
    }
  });

  it('changes a deep value by a nudge, not by a leap', () => {
    // The failure this scale exists to prevent.
    const chosen = 0.0137;
    const position = toSliderPosition(chosen, MIN, MAX);

    for (const nudged of [position - 1, position + 1]) {
      const ratio = fromSliderPosition(nudged, MIN, MAX) / chosen;
      expect(Math.abs(Math.log(ratio))).toBeLessThan(0.06);
    }
  });

  it('moves by the same proportion wherever the slider is', () => {
    const ratioAt = (position: number) =>
      fromSliderPosition(position + 1, MIN, MAX) / fromSliderPosition(position, MIN, MAX);

    // The whole point: one press means the same thing at both ends.
    expect(ratioAt(20)).toBeCloseTo(ratioAt(180), 2);
  });

  it('writes values short enough to read in the code', () => {
    for (let position = 1; position < LOG_SLIDER_POSITIONS; position += 7) {
      const value = fromSliderPosition(position, MIN, MAX);
      expect(String(value)).not.toMatch(/e/iu);
      // Three significant figures, so no centreX←0.013700000000000002.
      expect(String(value).replace(/[.-]/gu, '').replace(/^0+/u, '')).toMatch(/^\d{1,3}$/u);
    }
  });

  it('never leaves the declared range', () => {
    for (let position = 0; position <= LOG_SLIDER_POSITIONS; position += 1) {
      const value = fromSliderPosition(position, MIN, MAX);
      expect(value).toBeGreaterThanOrEqual(MIN);
      expect(value).toBeLessThanOrEqual(MAX);
    }
  });

  it('holds a value from outside the range at the nearest end', () => {
    // A shared link can carry a deeper zoom than the control can show; it must
    // not be reported as somewhere else entirely.
    expect(toSliderPosition(0.0001, MIN, MAX)).toBe(0);
    expect(toSliderPosition(50, MIN, MAX)).toBe(LOG_SLIDER_POSITIONS);
  });

  it('declines a range a geometric scale cannot describe', () => {
    // Zero and negatives have no logarithm; the caller falls back to linear.
    expect(toSliderPosition(1, 0, 2)).toBe(0);
    expect(fromSliderPosition(100, -1, 2)).toBe(-1);
    expect(fromSliderPosition(100, 2, 2)).toBe(2);
  });
});
