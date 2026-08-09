/**
 * Does the browser's Life engine agree with the APL it claims to be?
 *
 * The View APL drawer tells a visitor that the animation runs an equivalent
 * implementation of John Scholes's expression. That is a claim about two
 * programs producing the same thing, and the only way to establish it is to run
 * both and compare the results — which is what this does, against the real
 * TryAPL service, on the exact expression the drawer prints.
 *
 * ## Why one request
 *
 * TryAPL is a shared public service and this is a verification, not a runtime
 * dependency: the animation never calls it, and neither does `npm test`. The
 * whole suite — every fixture, every generation — is therefore assembled into a
 * single expression and sent once. Forty-nine matrices, one request.
 *
 * Run deliberately with `npm run test:live`.
 */

import { describe, expect, it } from 'vitest';
import { TryAplExecutionService } from '@/execution/TryAplExecutionService';
import { SCHOLES_WORKSPACE } from '@/life/lifeSource';
import { createWorld, isAlive, step, type LifeWorld } from '@/life/lifeEngine';

const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';

interface Fixture {
  readonly name: string;
  /** The world as a picture: `.` is dead, anything else alive. */
  readonly rows: readonly string[];
  /** How many generations to compare beyond the starting one. */
  readonly generations: number;
}

/**
 * Small, deterministic, and chosen so that a wrong engine cannot pass.
 *
 * A still life catches an engine that changes what should not change; a blinker
 * catches the survival rule; a glider catches births and the direction of
 * travel. The fourth is the one that matters most here, because it is the only
 * thing about this world that is a choice rather than a rule: a glider on a
 * five-cell torus returns to exactly where it began after twenty generations,
 * which is true only if both edges wrap the way the APL's rotations wrap them.
 * The R-pentomino is the general case — asymmetric, long-lived, and by the end
 * of eight generations touching most of its field.
 */
const FIXTURES: readonly Fixture[] = [
  {
    name: 'block (still life)',
    rows: ['......', '.OO...', '.OO...', '......', '......', '......'],
    generations: 4,
  },
  {
    name: 'blinker (oscillator)',
    rows: ['.....', '.....', '.OOO.', '.....', '.....'],
    generations: 4,
  },
  {
    name: 'glider (spaceship)',
    rows: ['........', '.O......', '..OO....', '.OO.....', '........', '........', '........', '........'],
    generations: 8,
  },
  {
    name: 'glider crossing the edges (torus)',
    rows: ['.O...', '..O..', 'OOO..', '.....', '.....'],
    generations: 20,
  },
  {
    name: 'R-pentomino (complex)',
    rows: [
      '............',
      '............',
      '............',
      '............',
      '.....OO.....',
      '....OO......',
      '.....O......',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
    generations: 8,
  },
];

/** The fixture as a world the engine can step. */
function worldFrom(fixture: Fixture): LifeWorld {
  const width = (fixture.rows[0] ?? '').length;
  const world = createWorld(width, fixture.rows.length);
  fixture.rows.forEach((row, y) => {
    [...row].forEach((glyph, x) => {
      if (glyph !== '.') world.cells[y * width + x] = 1;
    });
  });
  return world;
}

/** A world as the digits the APL will print, so both sides compare as one string. */
function digitsOf(world: LifeWorld): string {
  let out = '';
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) out += isAlive(world, x, y) ? '1' : '0';
  }
  return out;
}

/**
 * The whole suite as one APL expression.
 *
 * `life` is quoted from `lifeSource.ts` rather than written out here, so this
 * cannot drift from the expression the drawer shows a visitor. Each fixture is
 * built from a character literal — no spaces to be reformatted, no numeric
 * vector to be misread — and each generation is produced with the power
 * operator so that the APL, not this file, decides what follows what.
 *
 * Every result is emitted as "rows cols digits", and the whole lot is mixed into
 * one character matrix, which TryAPL prints a row at a time.
 */
function suiteExpression(): string {
  const statements: string[] = [
    SCHOLES_WORKSPACE,
    // Shape and contents on one line, with the digits run together: a boolean
    // formats as a single character, so nothing here can be ambiguous.
    "enc←{(⍕⍴⍵),' ',∊⍕¨,⍵}",
  ];

  FIXTURES.forEach((fixture, index) => {
    const width = (fixture.rows[0] ?? '').length;
    const bits = fixture.rows.join('').replaceAll('.', '0').replaceAll(/[^01]/gu, '1');
    statements.push(`M←${String(fixture.rows.length)} ${String(width)}⍴'${bits}'='1'`);
    statements.push(`R${String(index)}←{enc life⍣⍵⊢M}¨0,⍳${String(fixture.generations)}`);
  });

  statements.push(`↑${FIXTURES.map((_unused, index) => `R${String(index)}`).join(',')}`);
  return statements.join(' ⋄ ');
}

/** The printed lines, back as "rows cols digits" triples. */
function parseResults(lines: readonly string[]): { rows: number; columns: number; digits: string }[] {
  return lines
    .map((line) => /^(\d+)\s+(\d+)\s+([01]+)\s*$/u.exec(line.trimEnd()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      rows: Number(match[1]),
      columns: Number(match[2]),
      digits: match[3] ?? '',
    }));
}

describe('the engine against the APL it claims to be', () => {
  it('produces exactly the matrices Scholes’s expression produces', async () => {
    const service = new TryAplExecutionService({ endpoint: ENDPOINT });

    // One request, for the whole suite. See the note at the top of this file.
    const result = await service.execute({
      code: suiteExpression(),
      timeoutMs: 25_000,
      freshWorkspace: true,
    });

    const fromApl = parseResults(result.outputLines);

    const expected = FIXTURES.reduce((total, fixture) => total + fixture.generations + 1, 0);
    expect(fromApl, `TryAPL said: ${result.outputLines.join(' | ').slice(0, 400)}`).toHaveLength(expected);

    let offset = 0;
    for (const fixture of FIXTURES) {
      let world = worldFrom(fixture);

      for (let generation = 0; generation <= fixture.generations; generation += 1) {
        const apl = fromApl[offset + generation];
        const where = `${fixture.name}, generation ${String(generation)}`;

        // The same shape, because a torus that changed size would compare equal
        // on its contents and be a different world.
        expect(apl?.rows, where).toBe(world.height);
        expect(apl?.columns, where).toBe(world.width);

        // Cell for cell. Not a population, not a picture: the whole matrix.
        expect(apl?.digits, where).toBe(digitsOf(world));

        world = step(world);
      }

      offset += fixture.generations + 1;
    }
  });
});
