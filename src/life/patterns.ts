/**
 * The famous small creatures, and the composition the demo opens on.
 *
 * Each pattern is written as the picture it is, so that adding another is a
 * matter of drawing it rather than of counting coordinates. `.` is empty and
 * anything else is alive, which keeps the shapes legible in the source.
 *
 * The opening is deliberate rather than random, and it is small. See
 * `openingSeed` for why five cells beat a screenful of them.
 */

import { indexOf, step, type LifeWorld } from './lifeEngine';

export interface LifePattern {
  readonly id: string;
  readonly name: string;
  /** What it does, for the control that offers it. */
  readonly description: string;
  readonly rows: readonly string[];
}

const pattern = (id: string, name: string, description: string, rows: readonly string[]): LifePattern => ({
  id,
  name,
  description,
  rows,
});

export const GLIDER = pattern('glider', 'Glider', 'Walks diagonally, for ever.', ['.O.', '..O', 'OOO']);

export const BLINKER = pattern('blinker', 'Blinker', 'The smallest oscillator: two states.', ['OOO']);

export const TOAD = pattern('toad', 'Toad', 'A two-state oscillator with a little more to it.', [
  '.OOO',
  'OOO.',
]);

export const BLOCK = pattern('block', 'Block', 'A still life. Nothing ever happens to it.', ['OO', 'OO']);

export const LIGHTWEIGHT_SPACESHIP = pattern(
  'lwss',
  'Lightweight spaceship',
  'Travels straight across the world.',
  ['.OO..', 'OOOO.', 'OO.OO', '..OO.'],
);

export const PULSAR = pattern('pulsar', 'Pulsar', 'A large oscillator that beats every three steps.', [
  '..OOO...OOO..',
  '.............',
  'O....O.O....O',
  'O....O.O....O',
  'O....O.O....O',
  '..OOO...OOO..',
  '.............',
  '..OOO...OOO..',
  'O....O.O....O',
  'O....O.O....O',
  'O....O.O....O',
  '.............',
  '..OOO...OOO..',
]);

export const GOSPER_GLIDER_GUN = pattern(
  'gosper',
  'Gosper glider gun',
  'Fires a glider every thirty generations, for ever.',
  [
    '........................O...........',
    '......................O.O...........',
    '............OO......OO............OO',
    '...........O...O....OO............OO',
    'OO........O.....O...OO..............',
    'OO........O...O.OO....O.O...........',
    '..........O.....O.......O...........',
    '...........O...O....................',
    '............OO......................',
  ],
);

/*
 * The methuselahs: tiny seeds that take a very long time to settle.
 *
 * Both are quoted in their standard published orientation. They are the two
 * shapes the opening was chosen between — see `openingSeed`.
 */
export const R_PENTOMINO = pattern(
  'r-pentomino',
  'R-pentomino',
  'Five cells. Runs for over a thousand generations.',
  ['.OO', 'OO.', '.O.'],
);

export const ACORN = pattern('acorn', 'Acorn', 'Seven cells, and thousands of generations.', [
  '.O.....',
  '...O...',
  'OO..OOO',
]);

/** Everything a pattern chooser could offer, in the order it should offer them. */
export const PATTERNS: readonly LifePattern[] = [
  R_PENTOMINO,
  ACORN,
  GLIDER,
  LIGHTWEIGHT_SPACESHIP,
  PULSAR,
  GOSPER_GLIDER_GUN,
  BLINKER,
  TOAD,
  BLOCK,
];

/** Draws a pattern into a world at a position, wrapping like everything else. */
export function stamp(world: LifeWorld, item: LifePattern, atX: number, atY: number): void {
  item.rows.forEach((row, y) => {
    [...row].forEach((glyph, x) => {
      if (glyph === '.') return;
      world.cells[indexOf(world, atX + x, atY + y)] = 1;
    });
  });
}

/** The shape everything starts from: five cells, in the middle, every time. */
export const OPENING_SEED = R_PENTOMINO;

/**
 * The opening screen: one small creature, alone in the dark.
 *
 * This replaced a screenful of pulsars, spaceships and a glider gun. That was
 * impressive on arrival and wrong on reflection — it opened at its most complex
 * and had nowhere to go, and it said nothing about the idea the whole site is
 * built on. Five cells that turn into several hundred says it in about thirty
 * seconds, and nobody has to be told what happened.
 *
 * The R-pentomino was measured against the other small candidates on the grids
 * this page actually uses. Diehard empties the screen after 130 generations;
 * the pi-heptomino and the thunderbird have settled by 250; the acorn is a
 * close second, and larger. The R-pentomino is the smallest of them, the most
 * famous, and the strongest curve: five cells, past a hundred by generation 100,
 * several hundred by generation 600, and still moving thousands of generations
 * later once the debris has been round the torus and met itself.
 *
 * `advance` runs it on before anybody sees it, for the one case that needs a
 * still picture rather than a moving one — see the reduced-motion opening.
 *
 * Deterministic throughout: no randomness anywhere in here, so the first thing
 * anybody sees is the same first thing everybody sees.
 */
export function openingSeed(width: number, height: number, advance = 0): LifeWorld {
  let world: LifeWorld = {
    width,
    height,
    cells: new Uint8Array(width * height),
    ages: new Uint16Array(width * height),
    generation: 0,
  };

  // Middle of the field, so it has the whole world to spread into.
  const rows = OPENING_SEED.rows;
  stamp(
    world,
    OPENING_SEED,
    Math.floor((width - (rows[0] ?? '').length) / 2),
    Math.floor((height - rows.length) / 2),
  );

  for (let generation = 0; generation < advance; generation += 1) world = step(world);

  return world;
}

/**
 * A chaotic field, for Randomise.
 *
 * Sparser than a coin toss. At half density Life collapses almost at once into
 * scattered debris; around a quarter it stays busy for a long time and keeps
 * producing gliders, which is what makes a random field worth watching.
 */
export function randomField(width: number, height: number, random: () => number): LifeWorld {
  const world = {
    width,
    height,
    cells: new Uint8Array(width * height),
    ages: new Uint16Array(width * height),
    generation: 0,
  };

  for (let index = 0; index < world.cells.length; index += 1) {
    world.cells[index] = random() < 0.28 ? 1 : 0;
  }

  return world;
}
