/**
 * Conway's Game of Life, full screen.
 *
 * A different kind of page from the workspace, on purpose. There is no Run, no
 * empty canvas, no form: the address is the whole request, and the world is
 * already moving by the time anybody reads the title. Everything else floats
 * over it and gets out of the way.
 *
 * This is also where the immersive direction is being tried out — artwork to the
 * edges, chrome reduced to one bar, code behind a drawer that opens over the top
 * rather than taking a column away from the picture.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from '@/app/useMediaQuery';
import { getPalette, palettes } from '@/renderer/palettes';
import { accentPaletteFor, paletteSignature } from '@/theme/accentSource';
import { defaultRenderOptions } from '@/renderer/renderOptions';
import { usePublishAccentPalette } from '@/theme/accentContext';
import { MAX_AGE, population } from './lifeEngine';
import { LIFE_APL } from './lifeSource';
import { LifeCodePanel } from './LifeCodePanel';
import { SPEEDS, useLifeSimulation, type SpeedId, type WorldSize } from './useLifeSimulation';
import styles from './LifePage.module.css';

/**
 * How large a cell is on screen.
 *
 * Fourteen pixels, up from nine. The page used to open on a screenful of
 * structures, where the job of a cell was to be small enough that a world fitted
 * around them. It now opens on five cells in the middle of the dark, where the
 * job of a cell is to be seen — and five cells at nine pixels is a full stop.
 *
 * The cost is a smaller world, and it was measured rather than guessed: at this
 * size an ordinary window holds about 109 by 64, which is enough for the seed to
 * grow for several minutes before the debris has been round the torus and met
 * itself, and small enough that when it does, it stays busy.
 */
const CELL = 14;

/** Palettes worth putting a living world in. */
const LIFE_PALETTES = ['sunset', 'ember', 'neon', 'poolrooms', 'heat', 'forest', 'blueprint'] as const;

/**
 * How big a world to *start* in a window this size.
 *
 * Consulted when a run begins and never again. Once a world exists its
 * dimensions are its own — see `useLifeSimulation`.
 */
function worldSizeFor(width: number, height: number): WorldSize {
  return {
    width: Math.max(20, Math.floor(width / CELL)),
    height: Math.max(20, Math.floor(height / CELL)),
  };
}

/**
 * How large to draw a cell of this world, in this window.
 *
 * The whole world, always, fitted to the shorter axis and centred — so a resize
 * scales the picture rather than cropping it, and no cell can be pushed off the
 * screen by dragging a corner. Whole pixels, because a fractional cell size puts
 * a soft edge on every square in a grid of several thousand.
 *
 * The cost is a letterbox when the window's proportions no longer match the
 * world's. That is the honest thing to show: the world has not changed shape,
 * the window has.
 */
function scaleFor(world: WorldSize, width: number, height: number): number {
  return Math.max(1, Math.floor(Math.min(width / world.width, height / world.height)));
}

/** The gap between cells, so a crowd reads as cells rather than as a wash. */
function gutterFor(scale: number): number {
  if (scale >= 8) return 2;
  return scale >= 4 ? 1 : 0;
}

export function LifePage() {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));

  /* The size a *new* world should be, here and now. Not the size of this one. */
  const startingSize = useMemo(() => worldSizeFor(viewport.width, viewport.height), [viewport]);

  const simulation = useLifeSimulation({
    width: startingSize.width,
    height: startingSize.height,
    startPaused: reducedMotion,
  });

  const [paletteId, setPaletteId] = useState<string>('sunset');
  const [showCode, setShowCode] = useState(false);
  const [showInterface, setShowInterface] = useState(true);
  const palette = useMemo(() => getPalette(paletteId), [paletteId]);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* ── The window, which decides only how the world is shown ───────────────── */

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* ── The interface's own colours follow the world's ──────────────────────── */

  const publishAccentPalette = usePublishAccentPalette();
  const accentSignature = paletteSignature(accentPaletteFor(defaultRenderOptions(paletteId)));

  useEffect(() => {
    if (accentSignature === '') return;
    publishAccentPalette({ presetId: 'life', colours: accentSignature.split(',') });
  }, [accentSignature, publishAccentPalette]);

  useEffect(() => () => publishAccentPalette(null), [publishAccentPalette]);

  /* ── Drawing ─────────────────────────────────────────────────────────────── */

  const { world } = simulation;

  const scale = useMemo(() => scaleFor(world, viewport.width, viewport.height), [world, viewport]);
  const gutter = gutterFor(scale);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = world.width * scale;
    const height = world.height * scale;

    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = width * ratio;
      canvas.height = height * ratio;
    }

    const context = canvas.getContext('2d');
    if (context === null) return;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = palette.background ?? '#05060a';
    context.fillRect(0, 0, width, height);

    /*
     * Colour is age. A cell born this generation takes the brightest end of the
     * ramp and cools along it as it survives, so a glider crossing the field
     * pulls a bright head behind a dimmer tail and a still life sits quiet.
     * The rules never read this — it is entirely a way of seeing them.
     */
    const ramp = palette.colours;
    const brightest = ramp.length - 1;
    const dimmest = Math.max(0, ramp.length - 6);

    const buckets = new Map<string, Path2D>();
    for (const colour of ramp) buckets.set(colour, new Path2D());

    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const index = y * world.width + x;
        if (world.cells[index] !== 1) continue;

        const age = Math.min(MAX_AGE, world.ages[index] as number);
        const shade = Math.max(dimmest, brightest - age);
        const colour = ramp[shade] as string;
        buckets.get(colour)?.rect(x * scale, y * scale, scale - gutter, scale - gutter);
      }
    }

    // One fill per colour rather than one per cell: eight draw calls instead of
    // several thousand, which is the difference between smooth and not.
    for (const [colour, path] of buckets) {
      context.fillStyle = colour;
      context.fill(path);
    }
  }, [world, scale, gutter, palette]);

  /* ── Drawing on the world ────────────────────────────────────────────────── */

  const painting = useRef<{ alive: boolean; resume: boolean } | null>(null);

  const cellAt = useCallback(
    (event: { clientX: number; clientY: number }): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (canvas === null) return null;
      const box = canvas.getBoundingClientRect();
      const x = Math.floor(((event.clientX - box.left) / box.width) * world.width);
      const y = Math.floor(((event.clientY - box.top) / box.height) * world.height);
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
      return { x, y };
    },
    [world.width, world.height],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const cell = cellAt(event);
      if (cell === null) return;

      event.currentTarget.setPointerCapture(event.pointerId);

      /*
       * Erasing is the right button or a held modifier; otherwise the stroke
       * brings cells to life. Decided once, at the start of the stroke, so a
       * drag never flickers between the two as it crosses cells.
       */
      const erasing = event.button === 2 || event.shiftKey || event.altKey;

      /*
       * Drawing on a world that is moving fights back — the cell you place is
       * gone before you have finished the line. So the simulation pauses for the
       * stroke and resumes afterwards, which is what somebody meant to happen
       * rather than what they asked for.
       */
      const resume = simulation.running;
      if (resume) simulation.pause();

      painting.current = { alive: !erasing, resume };
      simulation.paint(cell.x, cell.y, !erasing);
    },
    [cellAt, simulation],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const stroke = painting.current;
      if (stroke === null) return;
      const cell = cellAt(event);
      if (cell !== null) simulation.paint(cell.x, cell.y, stroke.alive);
    },
    [cellAt, simulation],
  );

  const endStroke = useCallback(() => {
    const stroke = painting.current;
    painting.current = null;
    if (stroke?.resume === true) simulation.play();
  }, [simulation]);

  /* ── Keyboard ────────────────────────────────────────────────────────────── */

  const { toggle, stepOnce, pause } = simulation;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Never steal a key from something being typed into.
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;

      if (event.key === ' ') {
        event.preventDefault();
        toggle();
        return;
      }
      if (event.key === '.') {
        event.preventDefault();
        pause();
        stepOnce();
        return;
      }
      /*
       * H for the chrome. Purely a matter of what is drawn over the world — it
       * never touches the simulation, so it can be pressed at any point in a run
       * without costing a generation.
       */
      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        setShowInterface((shown) => {
          // Getting out of the way means the drawer as well as the bar.
          if (shown) setShowCode(false);
          return !shown;
        });
        return;
      }
      if (event.key === 'Escape') {
        if (showCode) setShowCode(false);
        // A hidden interface with the keyboard forgotten is a page with no way
        // out, so Escape brings it back whatever else it was going to do.
        else setShowInterface(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle, stepOnce, pause, showCode]);

  /* ── What the canvas is, for somebody who cannot see it ──────────────────── */

  const alive = population(world);
  const description =
    `Conway's Game of Life on a ${String(world.width)} by ${String(world.height)} toroidal grid. ` +
    `Generation ${String(world.generation)}, ${String(alive)} living cells. ` +
    `${simulation.running ? 'Running' : 'Paused'}.`;

  return (
    <div
      className={styles.page}
      data-running={simulation.running ? 'true' : undefined}
      // The letterbox takes the world's own background, so a window whose
      // proportions no longer match the world's does not show as a black bar.
      style={{ background: palette.background ?? '#04050a' }}
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: `${String(world.width * scale)}px`, height: `${String(world.height * scale)}px` }}
        role="img"
        aria-label={description}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onContextMenu={(event) => event.preventDefault()}
      />

      {/* Announced rather than drawn: the canvas cannot say this for itself. */}
      <p className={styles.live} role="status" aria-live="polite">
        {simulation.running ? 'Running' : 'Paused'}. Generation {world.generation}, {alive} living cells.
      </p>

      {/*
       * The way back, when there is nothing else on screen.
       *
       * Deliberately almost nothing: a small square in the corner that brightens
       * when the pointer finds it. It stays in the tab order and keeps its name,
       * so a hidden interface is quiet rather than lost.
       */}
      {showInterface ? null : (
        <button
          type="button"
          className={styles.restore}
          onClick={() => setShowInterface(true)}
          aria-keyshortcuts="H"
        >
          <span className="visually-hidden">Show controls</span>
          <span aria-hidden="true">☰</span>
        </button>
      )}

      <header className={styles.bar} hidden={!showInterface}>
        <a className={styles.home} href="#/">
          ← APL Art
        </a>
        <span className={styles.title}>
          Conway’s Game of Life
          <span className={styles.credit}>APL formulation by John Scholes</span>
        </span>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.action}
            onClick={simulation.toggle}
            aria-keyshortcuts="Space"
          >
            {simulation.running ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              simulation.pause();
              simulation.stepOnce();
            }}
            aria-keyshortcuts="Period"
          >
            Step
          </button>
          {/*
           * Both start a new run, and a new run is the one moment a world's
           * dimensions are decided — so they are told how big the window is now
           * rather than inheriting the shape of the world they replace.
           */}
          <button type="button" className={styles.action} onClick={() => simulation.randomise(startingSize)}>
            Randomise
          </button>
          <button type="button" className={styles.action} onClick={() => simulation.reset(startingSize)}>
            Reset
          </button>
          <button type="button" className={styles.action} onClick={simulation.emptyOut}>
            Clear
          </button>

          <label className={styles.choice}>
            <span className="visually-hidden">Speed</span>
            <select
              className={styles.select}
              value={simulation.speed}
              onChange={(event) => simulation.setSpeed(event.target.value as SpeedId)}
            >
              {SPEEDS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.choice}>
            <span className="visually-hidden">Palette</span>
            <select
              className={styles.select}
              value={paletteId}
              onChange={(event) => setPaletteId(event.target.value)}
            >
              {LIFE_PALETTES.map((id) => (
                <option key={id} value={id}>
                  {palettes.find((candidate) => candidate.id === id)?.name ?? id}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={styles.action}
            onClick={() => {
              setShowCode(false);
              setShowInterface(false);
            }}
            aria-keyshortcuts="H"
          >
            Hide controls
          </button>

          <button
            type="button"
            className={styles.primary}
            onClick={() => setShowCode(true)}
            aria-expanded={showCode}
            aria-controls="life-code"
          >
            View APL
          </button>
        </div>
      </header>

      <LifeCodePanel open={showCode} apl={LIFE_APL} onClose={() => setShowCode(false)} />
    </div>
  );
}
