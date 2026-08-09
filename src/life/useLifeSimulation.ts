/**
 * The running world: what it holds, and how often it moves.
 *
 * Two clocks, deliberately. The browser paints whenever it likes; the world
 * advances at the speed somebody chose. Tying the two together would mean the
 * simulation ran faster on a 120Hz screen than a 60Hz one, which is a strange
 * thing for a mathematical object to do.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clear, setCell, step, type LifeWorld } from './lifeEngine';
import { openingComposition, randomField } from './patterns';

/** Generations a second, by name, so the control offers places rather than numbers. */
export const SPEEDS = [
  { id: 'slow', label: 'Slow', perSecond: 4 },
  { id: 'steady', label: 'Steady', perSecond: 12 },
  { id: 'quick', label: 'Quick', perSecond: 24 },
  { id: 'headlong', label: 'Headlong', perSecond: 48 },
] as const;

export type SpeedId = (typeof SPEEDS)[number]['id'];

export interface LifeSimulation {
  readonly world: LifeWorld;
  readonly running: boolean;
  readonly speed: SpeedId;
  readonly play: () => void;
  readonly pause: () => void;
  readonly toggle: () => void;
  readonly stepOnce: () => void;
  readonly randomise: () => void;
  readonly reset: () => void;
  readonly emptyOut: () => void;
  readonly setSpeed: (speed: SpeedId) => void;
  readonly paint: (x: number, y: number, alive: boolean) => void;
  readonly resize: (width: number, height: number) => void;
}

/**
 * Carries what is on screen into a differently shaped world.
 *
 * A resize should not wipe what somebody has been watching, so the overlapping
 * region is copied and any new space arrives empty. Nothing clever: the world is
 * a rectangle, and this is the part of it that still exists.
 */
function reshape(world: LifeWorld, width: number, height: number): LifeWorld {
  const next: LifeWorld = {
    width,
    height,
    cells: new Uint8Array(width * height),
    ages: new Uint16Array(width * height),
    generation: world.generation,
  };

  const columns = Math.min(width, world.width);
  const rows = Math.min(height, world.height);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      next.cells[y * width + x] = world.cells[y * world.width + x] as number;
      next.ages[y * width + x] = world.ages[y * world.width + x] as number;
    }
  }

  return next;
}

export function useLifeSimulation(options: {
  readonly width: number;
  readonly height: number;
  /** Start paused, for somebody who has asked not to be moved at. */
  readonly startPaused: boolean;
}): LifeSimulation {
  const [world, setWorld] = useState<LifeWorld>(() => openingComposition(options.width, options.height));
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

  const randomise = useCallback(() => {
    setWorld((current) => randomField(current.width, current.height, Math.random));
  }, []);

  const reset = useCallback(() => {
    setWorld((current) => openingComposition(current.width, current.height));
  }, []);

  const emptyOut = useCallback(() => {
    setWorld((current) => clear(current));
  }, []);

  const paint = useCallback((x: number, y: number, alive: boolean) => {
    setWorld((current) => setCell(current, x, y, alive));
  }, []);

  const resize = useCallback((width: number, height: number) => {
    setWorld((current) =>
      current.width === width && current.height === height ? current : reshape(current, width, height),
    );
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
    resize,
  };
}
