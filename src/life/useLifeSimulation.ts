/**
 * The running world: what it holds, and how often it moves.
 *
 * Two clocks, deliberately. The browser paints whenever it likes; the world
 * advances at the speed somebody chose. Tying the two together would mean the
 * simulation ran faster on a 120Hz screen than a 60Hz one, which is a strange
 * thing for a mathematical object to do.
 *
 * ## The window is not the world
 *
 * A world's dimensions are fixed for the whole of its run. There is no resize
 * here on purpose: this used to reshape the grid to fit the window, which meant
 * dragging a corner deleted cells from a universe already in progress and
 * changed the torus underneath it. The window decides how a world is *shown* —
 * see `LifePage` — and nothing else.
 *
 * A new run is a different matter. `reset` and `randomise` take the size they
 * should be, so the world you start now suits the window you are starting it in.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clear, setCell, step, type LifeWorld } from './lifeEngine';
import { openingSeed, randomField } from './patterns';

/**
 * How far on the world is wound for somebody who has asked not to be moved at.
 *
 * A still picture of five cells is not a picture of anything. Reduced motion
 * should mean *this world, not animating* — so it opens on the same seed after
 * it has grown, which is the state everybody else reaches in half a minute.
 */
const STILL_GENERATION = 400;

/** Generations a second, by name, so the control offers places rather than numbers. */
export const SPEEDS = [
  { id: 'slow', label: 'Slow', perSecond: 4 },
  { id: 'steady', label: 'Steady', perSecond: 12 },
  { id: 'quick', label: 'Quick', perSecond: 24 },
  { id: 'godspeed', label: 'Godspeed You!', perSecond: 48 },
] as const;

export type SpeedId = (typeof SPEEDS)[number]['id'];

/** The shape of a world, decided when a run begins and not after. */
export interface WorldSize {
  readonly width: number;
  readonly height: number;
}

export interface LifeSimulation {
  readonly world: LifeWorld;
  readonly running: boolean;
  readonly speed: SpeedId;
  readonly play: () => void;
  readonly pause: () => void;
  readonly toggle: () => void;
  readonly stepOnce: () => void;
  /** Starts a new run, at a size suited to the window it is starting in. */
  readonly randomise: (size: WorldSize) => void;
  /** Starts a new run from the seed, likewise. */
  readonly reset: (size: WorldSize) => void;
  /** Empties the world somebody is working in, keeping its dimensions. */
  readonly emptyOut: () => void;
  readonly setSpeed: (speed: SpeedId) => void;
  readonly paint: (x: number, y: number, alive: boolean) => void;
}

export function useLifeSimulation(options: {
  readonly width: number;
  readonly height: number;
  /** Start paused, for somebody who has asked not to be moved at. */
  readonly startPaused: boolean;
}): LifeSimulation {
  const [world, setWorld] = useState<LifeWorld>(() =>
    openingSeed(options.width, options.height, options.startPaused ? STILL_GENERATION : 0),
  );
  const [running, setRunning] = useState(!options.startPaused);
  const [speed, setSpeed] = useState<SpeedId>('steady');

  const perSecond = useMemo(
    () => SPEEDS.find((candidate) => candidate.id === speed)?.perSecond ?? 12,
    [speed],
  );

  /*
   * The loop reads the rate through a ref so that changing speed does not tear
   * down and rebuild the animation frame — which would show as a stutter every
   * time somebody moved the control.
   */
  const rate = useRef(perSecond);
  useEffect(() => {
    rate.current = perSecond;
  }, [perSecond]);

  useEffect(() => {
    if (!running) return;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const due = 1000 / rate.current;
      if (now - last >= due) {
        /*
         * At most a few generations per frame. Without the ceiling, a tab left
         * in the background wakes up owing thousands of generations and locks
         * the page computing them all before it paints anything.
         */
        const owed = Math.min(4, Math.floor((now - last) / due));
        setWorld((current) => {
          let next = current;
          for (let index = 0; index < owed; index += 1) next = step(next);
          return next;
        });
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const play = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);
  const toggle = useCallback(() => setRunning((on) => !on), []);
  const stepOnce = useCallback(() => setWorld((current) => step(current)), []);

  /*
   * The two ways a run begins, and the only two places a world's dimensions are
   * decided. Both take the size from the caller rather than from the world they
   * replace, so a new run fits the window it is started in — while an existing
   * one keeps the shape it was born with, whatever happens to the window.
   */
  const randomise = useCallback((size: WorldSize) => {
    setWorld(randomField(size.width, size.height, Math.random));
  }, []);

  const reset = useCallback((size: WorldSize) => {
    setWorld(openingSeed(size.width, size.height));
  }, []);

  const emptyOut = useCallback(() => {
    setWorld((current) => clear(current));
  }, []);

  const paint = useCallback((x: number, y: number, alive: boolean) => {
    setWorld((current) => setCell(current, x, y, alive));
  }, []);

  return {
    world,
    running,
    speed,
    play,
    pause,
    toggle,
    stepOnce,
    randomise,
    reset,
    emptyOut,
    setSpeed,
    paint,
  };
}
