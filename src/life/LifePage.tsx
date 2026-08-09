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
import { SPEEDS, useLifeSimulation, type SpeedId } from './useLifeSimulation';
import styles from './LifePage.module.css';

/**
 * How large a cell is on screen.
 *
 * Nine pixels. Seven fitted more world on the screen and turned every creature
 * into a speck: a pulsar is thirteen cells across, and at seven pixels that is a
 * smudge the size of a full stop. Nine is where a glider still reads as a glider
 * from across a room, and an ordinary window still holds a world wide enough for
 * a spaceship to travel it.
 */
const CELL = 9;

/** Palettes worth putting a living world in, brightest ends first. */
const LIFE_PALETTES = ['ember', 'neon', 'poolrooms', 'sunset', 'heat', 'forest', 'blueprint'] as const;

/** The grid a viewport of this size holds. */
function gridFor(width: number, height: number): { columns: number; rows: number } {
  return {
    columns: Math.max(20, Math.floor(width / CELL)),
    rows: Math.max(20, Math.floor(height / CELL)),
  };
}

export function LifePage() {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));

  const grid = useMemo(() => gridFor(viewport.width, viewport.height), [viewport]);

  const simulation = useLifeSimulation({
    width: grid.columns,
    height: grid.rows,
    startPaused: reducedMotion,
  });

  const [paletteId, setPaletteId] = useState<string>('ember');
  const [showCode, setShowCode] = useState(false);
  const palette = useMemo(() => getPalette(paletteId), [paletteId]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resize } = simulation;

  /* ── The window, and the world that has to fit it ───────────────────────── */

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    resize(grid.columns, grid.rows);
  }, [grid.columns, grid.rows, resize]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = grid.columns * CELL;
    const height = grid.rows * CELL;

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
        buckets.get(colour)?.rect(x * CELL, y * CELL, CELL - 1, CELL - 1);
      }
    }

    // One fill per colour rather than one per cell: eight draw calls instead of
    // several thousand, which is the difference between smooth and not.
    for (const [colour, path] of buckets) {
      context.fillStyle = colour;
      context.fill(path);
    }
  }, [world, grid.columns, grid.rows, palette]);

  /* ── Drawing on the world ────────────────────────────────────────────────── */

  const painting = useRef<{ alive: boolean; resume: boolean } | null>(null);

  const cellAt = useCallback(
    (event: { clientX: number; clientY: number }): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (canvas === null) return null;
      const box = canvas.getBoundingClientRect();
      const x = Math.floor(((event.clientX - box.left) / box.width) * grid.columns);
      const y = Math.floor(((event.clientY - box.top) / box.height) * grid.rows);
      if (x < 0 || y < 0 || x >= grid.columns || y >= grid.rows) return null;
      return { x, y };
    },
    [grid.columns, grid.rows],
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
      if (event.key === 'Escape' && showCode) setShowCode(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle, stepOnce, pause, showCode]);

  /* ── What the canvas is, for somebody who cannot see it ──────────────────── */

  const alive = population(world);
  const description =
    `Conway's Game of Life on a ${String(grid.columns)} by ${String(grid.rows)} toroidal grid. ` +
    `Generation ${String(world.generation)}, ${String(alive)} living cells. ` +
    `${simulation.running ? 'Running' : 'Paused'}.`;

  return (
    <div className={styles.page} data-running={simulation.running ? 'true' : undefined}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: `${String(grid.columns * CELL)}px`, height: `${String(grid.rows * CELL)}px` }}
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

      <header className={styles.bar}>
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
          <button type="button" className={styles.action} onClick={simulation.randomise}>
            Randomise
          </button>
          <button type="button" className={styles.action} onClick={simulation.reset}>
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
