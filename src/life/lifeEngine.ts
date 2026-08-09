/**
 * Conway's Game of Life, on a torus.
 *
 * This is the simulation the animation actually runs. It is deliberately a
 * separate, testable thing from the APL shown in the code panel — but it is not
 * a different algorithm: both compute the same transformation, and
 * `lifeEngine.test.ts` holds this one to the rules directly, on the small
 * patterns whose behaviour is known.
 *
 * ## The rule this file may implement
 *
 * B3/S23, and nothing else. A standing constraint on the whole demo, worth
 * writing down here because every tempting change to it arrives disguised as an
 * improvement:
 *
 *   - No cells are ever introduced after generation 0 to keep the screen busy.
 *   - A world that settles into still lifes, starts oscillating, or dies out
 *     completely is left alone. Those are real outcomes of the rules and the
 *     point of watching is to see them.
 *   - Nothing restarts itself.
 *   - Cells have no lifespan. `MAX_AGE` below is a ceiling on a *counter*, not
 *     on a cell: a cell at the ceiling goes on living exactly as long as the
 *     rules say it does.
 *
 * Curating what generation 0 contains is a different matter and is allowed —
 * choosing the R-pentomino is choosing an interesting question to ask, not
 * changing the answer. After that, the rules alone.
 *
 * ## The boundary
 *
 * Toroidal, and that is this implementation's choice rather than part of
 * Conway's rules — which say nothing about edges. It is made to match the APL
 * on the panel: John Scholes's own notes say of his formulation that "the use of
 * ⊖ and ⌽ render opposite edges of the creatures' rectangular universe adjacent.
 * In effect, they live on the surface of a torus". So wrapping here is fidelity
 * to the expression being presented, not a liberty taken for the sake of a full
 * screen — and it should not be described as something Life requires.
 *
 * ## Ages
 *
 * Kept alongside the cells and read only by the renderer, so that a newly born
 * cell can arrive bright and cool as it survives. `step` writes them and never
 * consults them; the colour of a cell cannot affect whether it lives.
 */

/**
 * How old a cell may get before it stops looking any older.
 *
 * A rendering limit, not a lifespan. Past this the colour simply stops changing;
 * the cell itself is untouched, and only the rules decide whether it survives.
 */
export const MAX_AGE = 24;

export interface LifeWorld {
  readonly width: number;
  readonly height: number;
  /** One byte per cell: 1 alive, 0 dead. */
  readonly cells: Uint8Array;
  /** Generations this cell has been alive, 0 on the generation it was born. */
  readonly ages: Uint16Array;
  /** How many generations have been computed. */
  readonly generation: number;
}

export function createWorld(width: number, height: number): LifeWorld {
  return {
    width,
    height,
    cells: new Uint8Array(width * height),
    ages: new Uint16Array(width * height),
    generation: 0,
  };
}

/** The index of a cell, wrapping both ways — the torus, in one line. */
export function indexOf(world: { width: number; height: number }, x: number, y: number): number {
  const column = ((x % world.width) + world.width) % world.width;
  const row = ((y % world.height) + world.height) % world.height;
  return row * world.width + column;
}

export function isAlive(world: LifeWorld, x: number, y: number): boolean {
  return world.cells[indexOf(world, x, y)] === 1;
}

/**
 * How many of the eight neighbours are alive.
 *
 * Every offset goes through `indexOf`, so a cell on an edge counts the cells on
 * the opposite edge. That is the whole of the boundary model.
 */
export function neighbours(world: LifeWorld, x: number, y: number): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      count += world.cells[indexOf(world, x + dx, y + dy)] as number;
    }
  }
  return count;
}

/**
 * One generation.
 *
 * Standard Conway: a dead cell with exactly three living neighbours is born, a
 * living cell with two or three survives, everything else dies. Written as the
 * rule rather than as a table so that it reads as the rule.
 *
 * The whole of the transformation is `lives`, below. There is no clause for a
 * world that has gone quiet, no floor under the population, and no way for a
 * cell's age to reach this decision.
 */
export function step(world: LifeWorld): LifeWorld {
  const { width, height } = world;
  const cells = new Uint8Array(width * height);
  const ages = new Uint16Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const alive = world.cells[index] === 1;
      const count = neighbours(world, x, y);
      const lives = alive ? count === 2 || count === 3 : count === 3;

      cells[index] = lives ? 1 : 0;
      if (!lives) continue;

      // Born this generation, or one generation older than it was.
      ages[index] = alive ? Math.min(MAX_AGE, (world.ages[index] as number) + 1) : 0;
    }
  }

  return { width, height, cells, ages, generation: world.generation + 1 };
}

/** A world with the same shape and nothing alive in it. */
export function clear(world: LifeWorld): LifeWorld {
  return createWorld(world.width, world.height);
}

/**
 * Sets one cell, returning a new world.
 *
 * Ages reset on birth so a cell painted by hand arrives as bright as one the
 * rules produced — the colour means "new", and a drawn cell is new.
 */
export function setCell(world: LifeWorld, x: number, y: number, alive: boolean): LifeWorld {
  const index = indexOf(world, x, y);
  const cells = Uint8Array.from(world.cells);
  const ages = Uint16Array.from(world.ages);

  cells[index] = alive ? 1 : 0;
  ages[index] = 0;

  return { ...world, cells, ages };
}

/** How many cells are alive, which is all the readout a status line needs. */
export function population(world: LifeWorld): number {
  let count = 0;
  for (const cell of world.cells) count += cell;
  return count;
}
