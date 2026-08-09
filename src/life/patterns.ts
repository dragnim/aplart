/**
 * The famous small creatures, and the composition the demo opens on.
 *
 * Each pattern is written as the picture it is, so that adding another is a
 * matter of drawing it rather than of counting coordinates. `.` is empty and
 * anything else is alive, which keeps the shapes legible in the source.
 *
 * The opening composition is deliberate rather than random. Fifty per cent noise
 * settles into a grey mush within a few hundred generations and says nothing
 * about the rules; a field of known structures has gliders crossing it, pulsars
 * beating, and a gun producing a stream — different things happening in
 * different places, immediately, and all of it recognisably Life.
 */

import { indexOf, type LifeWorld } from './lifeEngine';

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

/** Everything a pattern chooser could offer, in the order it should offer them. */
export const PATTERNS: readonly LifePattern[] = [
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

/**
 * The opening screen.
 *
 * Placed in fractions of the field rather than in cells, so the same
 * composition arrives whatever size the window is — the gun is always near the
 * top left with room to fire across the width, the pulsars sit apart from each
 * other, and the gliders start where they will cross open space rather than
 * immediately colliding with something.
 *
 * Deterministic: no randomness anywhere in here, so the first thing anybody sees
 * is the same first thing everybody sees.
 */
export function openingComposition(width: number, height: number): LifeWorld {
  const world = {
    width,
    height,
    cells: new Uint8Array(width * height),
    ages: new Uint16Array(width * height),
    generation: 0,
  };

  /*
   * Laid out in cells rather than in fractions of the window.
   *
   * A composition placed proportionally spreads itself thinner the larger the
   * screen, which is exactly backwards: a wide window should hold *more* of the
   * world, not the same handful of creatures further apart. So the field is
   * filled on a fixed pitch and simply runs out when it reaches the edge.
   */
  const fits = (x: number, y: number, item: LifePattern) =>
    x >= 0 && y >= 0 && x + (item.rows[0] ?? '').length < width && y + item.rows.length < height;

  const place = (item: LifePattern, x: number, y: number) => {
    if (fits(x, y, item)) stamp(world, item, x, y);
  };

  /*
   * Bands, because the first dense attempt destroyed itself.
   *
   * Filling the field evenly with everything put spaceships and gliders directly
   * into the pulsars, and within a second of real time the composition had
   * collided into debris — busy, but no longer anything anybody had designed.
   *
   * So the still things and the moving things get their own horizontal bands.
   * Oscillators are stable for ever and are the visual backbone; travellers need
   * a clear lane to travel down. They meet eventually — the world is a torus and
   * everything comes round — but by then the piece has had its opening, and what
   * follows is Life rather than a wreck.
   */
  const band = (from: number, to: number) => ({
    top: Math.round(height * from),
    bottom: Math.round(height * to),
  });

  const lane = band(0.44, 0.58);

  /*
   * The lattice runs the whole height and simply steps over the lane.
   *
   * Giving the oscillators bands of their own left a dead strip wherever a row
   * of pulsars did not quite fit the band it had been given — a wide empty gap
   * across the screen, which is worse than either thing it was separating. One
   * lattice with a hole in it has no such seams.
   *
   * Pitch sixteen against a pulsar thirteen across leaves three cells between
   * neighbours: more than the one cell a neighbourhood reaches, so the lattice
   * beats for ever instead of eating itself.
   */
  for (let row = 0, y = 1; y + 14 < height; row += 1, y += 16) {
    const clearsLane = y + 14 < lane.top || y > lane.bottom;
    if (!clearsLane) continue;

    for (let x = 2 + (row % 2) * 8; x + 14 < width; x += 16) {
      place(PULSAR, x, y);
    }
  }

  /*
   * The lane: ranks rather than singles, because a formation crossing the screen
   * reads as movement from across a room where one small creature does not.
   */
  for (let rank = 0, y = lane.top + 2; y + 5 <= lane.bottom; rank += 1, y += 8) {
    const item = rank % 2 === 0 ? LIGHTWEIGHT_SPACESHIP : GLIDER;
    for (let x = 6 + rank * 7; x + 6 < width; x += 22) place(item, x, y);
  }

  /*
   * One gun, in the travelling band where it has room to fire.
   *
   * It is what stops the field ever settling: long after the opening structures
   * have found their equilibrium, gliders are still arriving from it.
   */
  place(GOSPER_GLIDER_GUN, 4, lane.top + 1);

  // A few blocks along the quiet edges of the travelling band, as punctuation.
  for (let x = 30; x + 2 < width; x += 47) {
    place(BLOCK, x, lane.top - 4);
    place(TOAD, x + 12, lane.bottom + 2);
  }

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
