/**
 * The order runs happen in, and when to give up.
 *
 * Separated from the benchmark itself so both can be tested without executing
 * anything: the script has a top-level `await main()` and importing it would
 * start hitting the live service.
 */

import { CEILINGS, SIZES, VIEWS, type IterationView } from './iterationViews';

export interface PlannedRun {
  readonly size: number;
  readonly view: IterationView;
  readonly iterations: number;
  readonly repetition: number;
}

/** Identifies a combination, for baselines and for keeping one matrix each. */
export function combinationKey(view: string, size: number, iterations: number): string {
  return `${view}:${String(size)}:${String(iterations)}`;
}

/**
 * Every combination once per repetition, rotated between repetitions.
 *
 * The rotation matters because the service is shared: measuring all three
 * repetitions of one ceiling in the same few minutes would attribute that
 * stretch of the afternoon to the ceiling. The stride spreads a combination's
 * repetitions roughly evenly across the whole run rather than shifting them by
 * one place, which a rotation of `repetition - 1` would do.
 */
export function schedule(repeats: number): PlannedRun[] {
  const combinations = SIZES.flatMap((size) =>
    VIEWS.flatMap((view) => CEILINGS.map((iterations) => ({ size, view, iterations }))),
  );

  const stride = Math.max(1, Math.floor(combinations.length / Math.max(1, repeats)));
  const planned: PlannedRun[] = [];

  for (let repetition = 1; repetition <= repeats; repetition += 1) {
    const offset = ((repetition - 1) * stride) % combinations.length;
    for (let step = 0; step < combinations.length; step += 1) {
      const entry = combinations[(offset + step) % combinations.length];
      if (entry !== undefined) planned.push({ ...entry, repetition });
    }
  }
  return planned;
}

/** How much slower than its own warm-up a run must be to count as abnormal. */
export const SLOW_FACTOR = 4;
/** Abnormal runs, on distinct combinations, that together mean an incident. */
export const SLOW_STOP = 3;
/** Combinations that must have a baseline before the latency rule may fire. */
export const MIN_BASELINES = 8;
/** Consecutive failures that mean the service rather than the measurement. */
export const FAILURE_STOP = 4;

/**
 * Whether a successful run took long enough to be suspicious.
 *
 * Judged against its own combination's warm-up rather than a running median
 * over everything: 144² at 60 iterations over the boundary is legitimately
 * several times slower than 128² at 28 over the interior, and one global
 * baseline would read the expensive end of the matrix as an outage.
 *
 * Silent until enough combinations have a baseline, so the opening runs of a
 * benchmark cannot trip it.
 */
export function isAbnormal(
  durationMs: number | null,
  baseline: number | undefined,
  baselineCount: number,
): boolean {
  if (baselineCount < MIN_BASELINES) return false;
  if (baseline === undefined || durationMs === null) return false;
  return durationMs > baseline * SLOW_FACTOR;
}

/**
 * Why to stop, or null to carry on.
 *
 * The latency rule needs three abnormal runs *on different combinations*.
 * Three in a row from the same one is a combination whose warm-up happened to
 * be quick, which is a measurement problem rather than a reason to abandon the
 * afternoon's work.
 */
export function stopReason(consecutiveFailures: number, slowStreak: readonly string[]): string | null {
  if (consecutiveFailures >= FAILURE_STOP) {
    return `${String(consecutiveFailures)} consecutive failed runs`;
  }

  const distinct = new Set(slowStreak).size;
  if (slowStreak.length >= SLOW_STOP && distinct >= SLOW_STOP) {
    return (
      `${String(slowStreak.length)} successive runs over ${String(SLOW_FACTOR)}× their own warm-up, ` +
      `across ${String(distinct)} different combinations`
    );
  }

  return null;
}
