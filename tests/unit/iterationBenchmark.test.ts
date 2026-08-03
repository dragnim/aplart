/**
 * The parts of the iteration benchmark that must be right before it runs.
 *
 * A benchmark against a shared remote service is expensive to repeat and easy
 * to invalidate: a schedule that groups a ceiling's repetitions together
 * attributes a slow ten minutes to the ceiling, and a stop rule that fires on
 * an expensive combination abandons the run for no reason. Both are pure
 * functions, so both can be settled here rather than discovered halfway through
 * an afternoon of live requests.
 *
 * Imported from `lib/`, not from the script: the script has a top-level
 * `await main()` and importing it would start making requests.
 */

import { describe, expect, it } from 'vitest';
import { numberAssignedTo } from '@/editor/parameterBinding';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { CEILINGS, SIZES, VIEWS, sourceFor } from '../../scripts/lib/iterationViews';
import {
  FAILURE_STOP,
  MIN_BASELINES,
  SLOW_FACTOR,
  SLOW_STOP,
  combinationKey,
  isAbnormal,
  schedule,
  stopReason,
} from '../../scripts/lib/iterationSchedule';

describe('what is being measured', () => {
  it('is the shipped program, with only the five values rewritten', () => {
    const view = VIEWS[0];
    expect(view).toBeDefined();
    const source = sourceFor(view!, 144, 48);

    expect(numberAssignedTo(source, 'size')).toBe(144);
    expect(numberAssignedTo(source, 'iterations')).toBe(48);
    expect(numberAssignedTo(source, 'centreX')).toBe(view!.centreX);
    expect(numberAssignedTo(source, 'centreY')).toBe(view!.centreY);
    expect(numberAssignedTo(source, 'zoom')).toBe(view!.zoom);

    /*
     * Everything else is the preset's own text. A benchmark that measured a
     * hand-written expression would answer a question about that expression
     * rather than about what a visitor waits for.
     */
    const untouched = (code: string) =>
      code
        .split('\n')
        .filter((line) => !/^(size|iterations|centreX|centreY|zoom)←/u.test(line))
        .join('\n');
    expect(untouched(source)).toBe(untouched(mandelbrotField.code));
  });

  it('stays inside the ranges the preset already offers', () => {
    // The review must not need the maximum raised to answer its question.
    const iterations = mandelbrotField.parameters.find((parameter) => parameter.variable === 'iterations');
    const size = mandelbrotField.parameters.find((parameter) => parameter.variable === 'size');

    for (const ceiling of CEILINGS) {
      expect(ceiling).toBeGreaterThanOrEqual(iterations?.min ?? 0);
      expect(ceiling).toBeLessThanOrEqual(iterations?.max ?? 0);
    }
    for (const resolution of SIZES) {
      expect(resolution).toBeLessThanOrEqual(size?.max ?? 0);
    }
    expect(CEILINGS).toContain(iterations?.defaultValue);
    expect(SIZES).toContain(size?.defaultValue);
  });

  it('covers the four views the review asks about', () => {
    expect(VIEWS.map((view) => view.id)).toEqual([
      'full-set',
      'boundary-heavy',
      'moderate-zoom',
      'mostly-interior',
    ]);
  });
});

describe('the schedule', () => {
  const repeats = 3;
  const planned = schedule(repeats);
  const combinations = SIZES.length * VIEWS.length * CEILINGS.length;

  it('runs every combination the same number of times', () => {
    expect(planned).toHaveLength(combinations * repeats);

    const counts = new Map<string, number>();
    for (const run of planned) {
      const key = combinationKey(run.view.id, run.size, run.iterations);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(combinations);
    for (const [key, count] of counts) expect(count, key).toBe(repeats);
  });

  it('spreads a combination’s repetitions across the run rather than adjacently', () => {
    /*
     * The point of rotating. If a combination's three measurements happened
     * within a few minutes of each other, its median would describe those few
     * minutes of a shared service.
     */
    const positions = new Map<string, number[]>();
    planned.forEach((run, index) => {
      const key = combinationKey(run.view.id, run.size, run.iterations);
      positions.set(key, [...(positions.get(key) ?? []), index]);
    });

    for (const [key, at] of positions) {
      const gaps = at.slice(1).map((position, index) => position - (at[index] as number));
      for (const gap of gaps) {
        // Comfortably more than a handful of runs apart, in both directions.
        expect(gap, `${key} gaps ${String(gaps)}`).toBeGreaterThan(combinations / 2);
      }
    }
  });

  it('asks for no repetition it was not told to', () => {
    expect(schedule(1)).toHaveLength(combinations);
    expect(new Set(schedule(1).map((run) => run.repetition))).toEqual(new Set([1]));
  });
});

describe('when to stop', () => {
  it('stops after four consecutive failures', () => {
    expect(stopReason(FAILURE_STOP - 1, [])).toBeNull();
    expect(stopReason(FAILURE_STOP, [])).toContain('consecutive failed runs');
  });

  it('says nothing about latency until enough baselines exist', () => {
    // The opening runs of a benchmark have almost no baselines, and the first
    // few timings are the least trustworthy of the whole run.
    expect(isAbnormal(100_000, 100, MIN_BASELINES - 1)).toBe(false);
    expect(isAbnormal(100_000, 100, MIN_BASELINES)).toBe(true);
  });

  it('judges a run against its own combination, not against the others', () => {
    /*
     * The failure this exists for: an expensive combination is not an incident.
     * A run at four times its own warm-up is suspicious; the same duration
     * against a slower baseline is simply that combination being slow.
     */
    expect(isAbnormal(4_400, 1_000, MIN_BASELINES)).toBe(true);
    expect(isAbnormal(4_400, 4_000, MIN_BASELINES)).toBe(false);
    expect(isAbnormal(1_000 * SLOW_FACTOR, 1_000, MIN_BASELINES)).toBe(false);
  });

  it('needs three abnormal runs on three different combinations', () => {
    const one = combinationKey('full-set', 128, 28);
    const two = combinationKey('full-set', 128, 40);
    const three = combinationKey('boundary-heavy', 144, 60);

    // Three in a row from the same combination is a combination whose warm-up
    // was quick, not a service in trouble.
    expect(stopReason(0, [one, one, one])).toBeNull();
    expect(stopReason(0, [one, one, two])).toBeNull();
    expect(stopReason(0, [one, two, three])).toContain('different combinations');
  });

  it('needs them successive, which the caller expresses by clearing the streak', () => {
    // A shorter streak never stops, whatever it contains.
    expect(stopReason(0, [combinationKey('full-set', 128, 28)])).toBeNull();
    expect(stopReason(0, [])).toBeNull();
    expect(SLOW_STOP).toBe(3);
  });

  it('names the reason, so the record says why it ended', () => {
    const reason = stopReason(0, [
      combinationKey('full-set', 128, 28),
      combinationKey('full-set', 128, 40),
      combinationKey('moderate-zoom', 144, 60),
    ]);
    expect(reason).toContain(`${String(SLOW_FACTOR)}×`);
    expect(reason).toContain('their own warm-up');
  });
});
