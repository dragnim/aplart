/**
 * What the readout is allowed to claim.
 *
 * The numbers are cheap to produce and easy to produce wrongly, so these test
 * the definitions rather than the presence of digits: births and deaths counted
 * against a picture whose changes can be read off by eye, activity against its
 * own arithmetic, and — the part that matters most — nothing reported at all for
 * a world that no generation produced.
 */

import { describe, expect, it } from 'vitest';
import { activity, clear, createWorld, population, setCell, step, type LifeWorld } from '@/life/lifeEngine';
import { openingSeed, randomField } from '@/life/patterns';

function worldFrom(rows: readonly string[]): LifeWorld {
  const world = createWorld((rows[0] ?? '').length, rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((glyph, x) => {
      if (glyph !== '.') world.cells[y * world.width + x] = 1;
    });
  });
  return world;
}

describe('what a step reports about itself', () => {
  it('counts a blinker turning over: two born, two died', () => {
    /*
     * The whole transition is visible in the picture. A horizontal blinker
     * becomes a vertical one: the two ends die, two cells above and below the
     * centre are born, and the centre survives untouched.
     */
    const blinker = worldFrom(['.....', '.....', '.OOO.', '.....', '.....']);

    const next = step(blinker);

    expect(next.transition).toEqual({ births: 2, deaths: 2 });
    expect(population(next)).toBe(3);
  });

  it('counts a block as still: nothing born, nothing died', () => {
    // A still life is the case where zero is the truthful answer — and it is
    // reported as zero rather than as nothing, because a step really happened.
    const block = worldFrom(['....', '.OO.', '.OO.', '....']);

    const next = step(block);

    expect(next.transition).toEqual({ births: 0, deaths: 0 });
    expect(activity(next)).toBe(0);
  });

  it('counts a world dying out as all deaths and no births', () => {
    const pair = worldFrom(['....', '.OO.', '....', '....']);

    const next = step(pair);

    expect(next.transition).toEqual({ births: 0, deaths: 2 });
    expect(population(next)).toBe(0);
  });
});

describe('activity', () => {
  it('is the share of every cell in the grid that changed', () => {
    /*
     * Four changes in a grid of twenty-five, which is sixteen per cent. The
     * denominator is the whole world rather than the living population: the
     * question is how much of the world moved.
     */
    const blinker = worldFrom(['.....', '.....', '.OOO.', '.....', '.....']);

    const next = step(blinker);

    expect(next.width * next.height).toBe(25);
    expect(activity(next)).toBeCloseTo(16, 10);
  });

  it('follows births and deaths exactly, whatever the world', () => {
    // Checked against the definition on a real run rather than on one picture,
    // so an implementation that happened to suit a blinker would still fail.
    let world = randomField(30, 20, mulberry(7));

    for (let generation = 0; generation < 12; generation += 1) {
      world = step(world);
      const { births, deaths } = world.transition ?? { births: -1, deaths: -1 };
      expect(activity(world)).toBeCloseTo(((births + deaths) / (30 * 20)) * 100, 10);
    }
  });
});

describe('what no generation produced', () => {
  it('says nothing about a freshly created world', () => {
    const world = createWorld(10, 10);

    expect(world.generation).toBe(0);
    expect(world.transition).toBeNull();
    expect(activity(world)).toBeNull();
  });

  it('says nothing about the opening seed', () => {
    const seed = openingSeed(40, 30);

    expect(seed.generation).toBe(0);
    expect(population(seed)).toBeGreaterThan(0);
    expect(seed.transition).toBeNull();
    expect(activity(seed)).toBeNull();
  });

  it('says nothing about a random field', () => {
    const field = randomField(40, 30, mulberry(1));

    expect(field.generation).toBe(0);
    expect(field.transition).toBeNull();
  });

  it('says nothing about an emptied world', () => {
    const emptied = clear(step(worldFrom(['.....', '.OOO.', '.....'])));

    expect(population(emptied)).toBe(0);
    expect(emptied.transition).toBeNull();
    expect(activity(emptied)).toBeNull();
  });

  it('forgets the last step as soon as a cell is painted', () => {
    /*
     * The one that would be easiest to get wrong, and the most misleading if it
     * were: a painted cell is not a birth, so a world that has been drawn on has
     * no transition to report even though the step before it did.
     */
    const stepped = step(worldFrom(['.....', '.OOO.', '.....']));
    expect(stepped.transition).not.toBeNull();

    const painted = setCell(stepped, 0, 0, true);

    expect(painted.transition).toBeNull();
    expect(activity(painted)).toBeNull();
    // The population moved, because a cell really did come alive.
    expect(population(painted)).toBe(population(stepped) + 1);
    // And the generation did not, because painting is not a generation.
    expect(painted.generation).toBe(stepped.generation);
  });
});

/** A small deterministic generator, so a "random" field is the same every run. */
function mulberry(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
