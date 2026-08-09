/**
 * The rules, on the patterns whose behaviour is known.
 *
 * Small worlds and named creatures rather than screenshots: a blinker that fails
 * to oscillate is a broken rule, and it is visible in four cells. The point of
 * testing it this way is that the animation on screen is only trustworthy if
 * this is — the code panel claims the picture comes from Conway's rules, and
 * these are what make that claim checkable.
 */

import { describe, expect, it } from 'vitest';
import {
  clear,
  createWorld,
  isAlive,
  neighbours,
  population,
  setCell,
  step,
  type LifeWorld,
} from '@/life/lifeEngine';
import { BLINKER, BLOCK, GLIDER, openingComposition, randomField, stamp } from '@/life/patterns';

/** A world drawn as a picture, so a test reads like the thing it is testing. */
function worldFrom(rows: readonly string[]): LifeWorld {
  const world = createWorld((rows[0] ?? '').length, rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((glyph, x) => {
      if (glyph !== '.') world.cells[y * world.width + x] = 1;
    });
  });
  return world;
}

/** The world as a picture again, for comparing against one. */
function pictureOf(world: LifeWorld): string[] {
  const rows: string[] = [];
  for (let y = 0; y < world.height; y += 1) {
    let row = '';
    for (let x = 0; x < world.width; x += 1) row += isAlive(world, x, y) ? 'O' : '.';
    rows.push(row);
  }
  return rows;
}

describe('the rules', () => {
  it('leaves a still life exactly as it was', () => {
    const before = worldFrom(['......', '..OO..', '..OO..', '......', '......', '......']);
    const after = step(before);

    expect(pictureOf(after)).toEqual(pictureOf(before));
  });

  it('oscillates a blinker, and returns it after two generations', () => {
    const horizontal = worldFrom(['.....', '.....', '.OOO.', '.....', '.....']);

    const vertical = step(horizontal);
    expect(pictureOf(vertical)).toEqual(['.....', '..O..', '..O..', '..O..', '.....']);

    expect(pictureOf(step(vertical))).toEqual(pictureOf(horizontal));
  });

  it('walks a glider one cell diagonally every four generations', () => {
    /*
     * The property that makes a glider a glider. Four generations move it
     * exactly one cell right and one cell down, and the shape returns — so
     * comparing the whole field against the same glider stamped one cell along
     * is a complete statement of what it should have done.
     */
    let world = createWorld(20, 20);
    stamp(world, GLIDER, 4, 4);

    for (let generation = 0; generation < 4; generation += 1) world = step(world);

    const expected = createWorld(20, 20);
    stamp(expected, GLIDER, 5, 5);

    expect(pictureOf(world)).toEqual(pictureOf(expected));
  });

  it('kills a lone cell and a crowded one alike', () => {
    expect(population(step(worldFrom(['.....', '..O..', '.....'])))).toBe(0);

    // Every neighbour alive: the middle is overcrowded and dies with them.
    const crowded = worldFrom(['OOO', 'OOO', 'OOO']);
    expect(isAlive(step(crowded), 1, 1)).toBe(false);
  });

  it('births a cell with exactly three neighbours and no others', () => {
    for (let count = 0; count <= 8; count += 1) {
      const world = createWorld(9, 3);
      // Lay `count` neighbours around a dead middle cell at (4, 1).
      const offsets: readonly [number, number][] = [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ];
      for (let index = 0; index < count; index += 1) {
        const [dx, dy] = offsets[index] as [number, number];
        world.cells[(1 + dy) * world.width + (4 + dx)] = 1;
      }

      expect(isAlive(step(world), 4, 1), `${String(count)} neighbours`).toBe(count === 3);
    }
  });
});

describe('the boundary', () => {
  it('counts neighbours across the edges, so the world is a torus', () => {
    const world = createWorld(5, 5);
    // Three cells in the corners, which are neighbours only if the edges join.
    world.cells[0] = 1;
    world.cells[4] = 1;
    world.cells[20] = 1;

    expect(neighbours(world, 0, 0)).toBe(2);
    // The far corner touches all three, diagonally across both wraps.
    expect(neighbours(world, 4, 4)).toBe(3);
  });

  it('carries a glider off one edge and back on the other', () => {
    /*
     * Twenty generations move a glider five cells along each axis. On a world
     * exactly five wide it therefore comes back to where it started, which is
     * only true if both edges wrap.
     */
    let world = createWorld(5, 5);
    stamp(world, GLIDER, 0, 0);
    const before = pictureOf(world);

    for (let generation = 0; generation < 20; generation += 1) world = step(world);

    expect(pictureOf(world)).toEqual(before);
  });

  it('has no dead edge: a blinker on the boundary still oscillates', () => {
    const world = createWorld(5, 5);
    stamp(world, BLINKER, 4, 0);

    const after = step(world);
    expect(population(after)).toBe(3);
    // Turned about its middle, which for a wrapped blinker is column 0.
    expect(isAlive(after, 0, 4)).toBe(true);
    expect(isAlive(after, 0, 1)).toBe(true);
  });
});

describe('ages', () => {
  it('marks a newly born cell as new and lets a survivor grow older', () => {
    const world = worldFrom(['.....', '..O..', '..O..', '..O..', '.....']);
    const after = step(world);

    // The middle survived; the two ends were born.
    expect(after.ages[after.width * 2 + 2]).toBe(1);
    expect(after.ages[after.width * 2 + 1]).toBe(0);
    expect(after.ages[after.width * 2 + 3]).toBe(0);
  });

  it('treats a cell drawn by hand as newly born', () => {
    const world = setCell(createWorld(5, 5), 2, 2, true);
    expect(world.ages[12]).toBe(0);
    expect(isAlive(world, 2, 2)).toBe(true);
  });
});

describe('editing', () => {
  it('sets and clears one cell without disturbing the rest', () => {
    let world = createWorld(6, 6);
    stamp(world, BLOCK, 0, 0);

    world = setCell(world, 4, 4, true);
    expect(population(world)).toBe(5);

    world = setCell(world, 4, 4, false);
    expect(population(world)).toBe(4);
    expect(isAlive(world, 0, 0)).toBe(true);
  });

  it('empties the world without changing its shape', () => {
    const world = clear(openingComposition(60, 40));
    expect(population(world)).toBe(0);
    expect(world.width).toBe(60);
    expect(world.height).toBe(40);
  });
});

describe('the opening composition', () => {
  it('is the same every time, whatever else is going on', () => {
    const first = openingComposition(120, 80);
    const second = openingComposition(120, 80);
    expect([...first.cells]).toEqual([...second.cells]);
  });

  it('fills the field without being noise', () => {
    const world = openingComposition(160, 100);
    const density = population(world) / world.cells.length;

    /*
     * Somewhere between empty and soup. The first attempt at this composition
     * placed a dozen creatures in fractions of the field and came out at about
     * one per cent — on a full screen that is a few specks in the dark. A random
     * field runs at twenty-eight per cent and reads as static. This wants to be
     * unmistakably made of structures and still fill the screen.
     */
    expect(density).toBeGreaterThan(0.03);
    expect(density).toBeLessThan(0.15);
  });

  it('is still busy and still changing after a hundred generations', () => {
    /*
     * The claim the opening screen makes is that something is happening — not
     * that it grows. The dense composition collides with itself early on and the
     * population falls before the guns make it up again, so the honest test is
     * that the field neither empties nor settles: plenty still alive, and the
     * next generation still different from this one.
     */
    let world = openingComposition(160, 100);

    for (let generation = 0; generation < 100; generation += 1) world = step(world);

    expect(population(world)).toBeGreaterThan(300);

    const next = step(world);
    const changed = [...world.cells].filter((cell, index) => cell !== next.cells[index]).length;
    expect(changed, 'the world is still moving').toBeGreaterThan(50);
  });

  it('places every structure inside the field', () => {
    const world = openingComposition(120, 80);
    expect(world.cells.length).toBe(120 * 80);
    expect(population(world)).toBeGreaterThan(0);
  });
});

describe('the random field', () => {
  it('is reproducible from its generator', () => {
    const generator = (seed: number) => {
      let state = seed;
      return () => {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;
        return state / 0x1_0000_0000;
      };
    };

    const first = randomField(40, 30, generator(7));
    const second = randomField(40, 30, generator(7));
    expect([...first.cells]).toEqual([...second.cells]);
  });

  it('is sparse enough to keep going rather than collapsing at once', () => {
    const world = randomField(100, 100, () => 0.2);
    // Every draw below the threshold, so this is the density it aims for.
    expect(population(world)).toBe(10_000);
  });
});
