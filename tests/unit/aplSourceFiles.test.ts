/**
 * The `.apl` files are the artwork programs.
 *
 * Each artwork's APL lives in `src/presets/apl/<preset-id>.apl` and its
 * TypeScript module imports it. That is not a filing preference: the file is
 * what the editor shows, what is sent to TryAPL, what a shared link is decoded
 * against and what decides whether a restored project counts as edited. So
 * these tests are less about the extraction having happened than about it
 * having changed nothing, and about there being no second copy anywhere that
 * could drift from it.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artworkSource } from '@/presets/artworkSource';
import { presets } from '@/presets/presets';
import { aplCharacterCount } from '@/presets/codeMetrics';
import { bindingStateFor } from '@/editor/parameterBinding';

const ROOT = join(import.meta.dirname, '..', '..');
const APL = join(ROOT, 'src', 'presets', 'apl');

const fileFor = (id: string) => join(APL, `${id}.apl`);
const bytesFor = (id: string) => readFileSync(fileFor(id));
const textFor = (id: string) => readFileSync(fileFor(id), 'utf8');

describe('every artwork has a source file', () => {
  it.each(presets.map((preset) => preset.id))('%s reads its program from src/presets/apl', (id) => {
    const preset = presets.find((candidate) => candidate.id === id);
    expect(preset).toBeDefined();
    expect(artworkSource(textFor(id))).toBe(preset?.code);
  });

  it('imports the file rather than restating it', () => {
    for (const preset of presets) {
      const module = readFileSync(join(ROOT, 'src', 'presets', `${preset.id}.ts`), 'utf8');
      expect(module).toContain(`./apl/${preset.id}.apl?raw`);
      expect(module).toContain('code: artworkSource(source),');
    }
  });

  it('leaves no second copy of any program in TypeScript', () => {
    /*
     * The failure this exists for is a duplicate that still compiles: someone
     * pastes a line back while debugging and the editor now shows one thing
     * while the file says another. Prose is allowed to quote a glyph — the
     * "try changing this" notes do — so what is looked for is a whole line of
     * the actual program appearing verbatim in the module beside it.
     */
    for (const preset of presets) {
      const module = readFileSync(join(ROOT, 'src', 'presets', `${preset.id}.ts`), 'utf8');
      const substantial = preset.code
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length >= 8 && !line.startsWith('⍝'));

      expect(substantial.length).toBeGreaterThan(0);
      for (const line of substantial) {
        expect(module, `${preset.id} restates: ${line}`).not.toContain(line);
      }
    }
  });

  it('keeps no orphaned or unclaimed source files', () => {
    // A file nobody imports is a program that cannot be run and will not be
    // maintained; a preset without one would be back to an inline copy.
    const onDisk = readdirSync(APL)
      .filter((name) => name.endsWith('.apl'))
      .sort();
    expect(onDisk).toEqual(presets.map((preset) => `${preset.id}.apl`).sort());
  });
});

describe('the files themselves', () => {
  it.each(presets.map((preset) => preset.id))('%s is UTF-8, LF, with one final newline', (id) => {
    const bytes = bytesFor(id);
    const text = bytes.toString('utf8');

    // A byte-order mark would arrive in the editor as an invisible first
    // character and go to TryAPL as part of the first line.
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    expect(text).not.toContain('\r');
    expect(text).not.toContain('�');

    // Ends with exactly one newline: the file convention, not a blank last
    // line in the program.
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);

    // Round-trips through UTF-8 unchanged, so no glyph was mangled on the way
    // to disk by an editor guessing a codepage.
    expect(Buffer.from(text, 'utf8').equals(bytes)).toBe(true);
  });

  it('keeps the APL glyphs the programs are made of', () => {
    // A spot check with teeth: these are the glyphs that would be silently
    // replaced by an encoding accident, and each is load-bearing where it
    // appears.
    expect(textFor('modular-bloom')).toContain('∘.×⍨⍳');
    expect(textFor('mandelbrot-field')).toContain('⊃⌽step⍣iterations⊢');
    expect(textFor('mandelbrot-field')).toContain('¯9⌈9⌊');
    expect(textFor('mandelbrot-field')).toContain('ci←⍉');
    expect(textFor('truchet-grid')).toContain('∘.+');
    expect(textFor('cellular-echo')).toContain('rb←⌽(8⍴2)⊤rule');
  });
});

/**
 * The extraction moved text; it did not edit it.
 *
 * Pinned by digest because every compatibility question in this stage reduces
 * to the same one — is the string identical? A saved project is compared
 * against `preset.code` to decide whether it says "Original" or "Edited", a
 * shared link carries the code itself, and the gallery counts its characters.
 * All of those keep working precisely as long as these digests hold.
 *
 * Changing an artwork's APL is therefore a deliberate act that updates a digest
 * here, and never something that happens as a side effect of moving files
 * about.
 */
describe('the programs are unchanged by the move', () => {
  /** Preset id to the first twelve hex digits of the SHA-256 of its program. */
  const EXPECTED: Readonly<Record<string, { digest: string; characters: number; lines: number }>> = {
    'modular-bloom': { digest: '7cbb36a27a3a', characters: 137, lines: 7 },
    'checker-shift': { digest: 'f6062cf76e13', characters: 136, lines: 7 },
    'wave-interference': { digest: 'f6257e4a3a63', characters: 440, lines: 17 },
    'truchet-grid': { digest: '2c9ef6399089', characters: 458, lines: 12 },
    'sierpinski-array': { digest: 'd380643951cd', characters: 220, lines: 13 },
    'cellular-echo': { digest: 'e6c5c2c033b2', characters: 489, lines: 18 },
    // Changed deliberately in Stage 4: the iteration default moved from 28 to
    // 48. Same length, because both are two digits — which is exactly why a
    // character count alone would not have noticed.
    'mandelbrot-field': { digest: '5a8df3d17814', characters: 625, lines: 19 },
    'julia-set': { digest: 'a27419d64442', characters: 877, lines: 25 },
    // Added in Stage 7. Mandelbrot's program plus two absolute values and the
    // comment that points at them, at the framing chosen from live output.
    'burning-ship': { digest: '4041cee8def3', characters: 779, lines: 21 },
  };

  it('has an expectation for every artwork in the gallery', () => {
    // Otherwise a new artwork would quietly opt out of the whole check.
    expect(Object.keys(EXPECTED).sort()).toEqual(presets.map((preset) => preset.id).sort());
  });

  it.each(Object.entries(EXPECTED))('%s is the same program it was before', (id, expected) => {
    const preset = presets.find((candidate) => candidate.id === id);
    expect(preset).toBeDefined();
    const code = preset?.code ?? '';

    expect(createHash('sha256').update(code, 'utf8').digest('hex').slice(0, 12)).toBe(expected.digest);
    expect([...code].length).toBe(expected.characters);
    expect(code.split('\n').length).toBe(expected.lines);
  });

  it('still counts the characters the gallery advertises', () => {
    // Counted from the executable expression, so a preserved comment cannot
    // inflate it. Non-zero for every artwork means every program still parses
    // far enough to be counted.
    for (const preset of presets) {
      expect(aplCharacterCount(preset.code), preset.id).toBeGreaterThan(0);
    }
  });
});

describe('the controls still find their assignments', () => {
  it.each(presets.map((preset) => preset.id))('%s binds every parameter', (id) => {
    /*
     * Parameter binding reads the assignment out of the code by name. It is the
     * part most easily broken by an invisible change — a stray carriage return
     * or a shifted line — and the symptom would be a slider announcing itself
     * detached rather than anything failing to build.
     */
    const preset = presets.find((candidate) => candidate.id === id);
    expect(preset?.parameters.length).toBeGreaterThan(0);

    for (const parameter of preset?.parameters ?? []) {
      const binding = bindingStateFor(preset?.code ?? '', parameter);
      expect(binding.status, `${id}.${parameter.variable}`).toBe('bound');
    }
  });
});

/**
 * A deliberately narrow canonicalisation contract.
 *
 * `artworkSource` sits between a text file and the program a person reads,
 * edits and sends to an interpreter, which makes it the one place where a
 * well-meant tidy-up would be invisible and permanent. Whitespace in APL is not
 * decoration: a stray space changes the character count the gallery advertises,
 * and any change at all reclassifies somebody's saved project as an edit.
 *
 * So the contract is exhaustive rather than illustrative. It does exactly four
 * things — remove carriage returns, remove at most one terminal newline, keep
 * an intentional blank final line, and nothing else — and each clause has a
 * test, including the ones asserting that something does *not* happen.
 */
describe('artworkSource', () => {
  it('removes the file convention and nothing else', () => {
    expect(artworkSource('a←1\nb←2\n')).toBe('a←1\nb←2');
  });

  it('gives the same program whether or not a tool kept the final newline', () => {
    // The reason for stripping rather than requiring: an editor that adds or
    // removes a final newline must not change what the artwork is.
    expect(artworkSource('a←1\nb←2')).toBe(artworkSource('a←1\nb←2\n'));
  });

  it('keeps a deliberately blank last line', () => {
    expect(artworkSource('a←1\n\n')).toBe('a←1\n');
  });

  it('removes one terminal newline and no more, however many there are', () => {
    expect(artworkSource('a←1\n\n\n')).toBe('a←1\n\n');
    expect(artworkSource('a←1\n\n\n\n')).toBe('a←1\n\n\n');
  });

  it('leaves leading blank lines alone', () => {
    expect(artworkSource('\na←1\n')).toBe('\na←1');
    expect(artworkSource('\n\n\na←1\n')).toBe('\n\n\na←1');
  });

  it('survives a checkout that ignored .gitattributes', () => {
    expect(artworkSource('a←1\r\nb←2\r\n')).toBe('a←1\nb←2');
  });

  it('removes a lone carriage return as well as a paired one', () => {
    /*
     * An old-Mac line ending, or one line of a file mangled halfway through.
     * It becomes a newline rather than disappearing: deleting it would satisfy
     * "remove carriage returns" by silently joining two lines of APL, which is
     * a worse outcome than the problem being fixed.
     */
    expect(artworkSource('a←1\rb←2\n')).toBe('a←1\nb←2');
  });

  it('preserves indentation at the start of a line', () => {
    // A dfn body or a continued expression can be indented deliberately, and
    // dedenting it would silently rewrite what the person wrote.
    expect(artworkSource('  a←1\n    b←2\n')).toBe('  a←1\n    b←2');
  });

  it('preserves runs of spaces inside a line', () => {
    expect(artworkSource('a ←  1   ⋄   b←2\n')).toBe('a ←  1   ⋄   b←2');
  });

  it('preserves trailing spaces on a line', () => {
    // Invisible and usually accidental, and still not this function's to
    // remove: it would change the character count and the saved-project
    // comparison for a file nobody had edited.
    expect(artworkSource('a←1   \nb←2  \n')).toBe('a←1   \nb←2  ');
  });

  it('preserves trailing spaces on the last line', () => {
    // The one place a trim would be most tempting and most damaging, because
    // the terminal newline is being removed right beside it.
    expect(artworkSource('a←1\nb←2  \n')).toBe('a←1\nb←2  ');
  });

  it('preserves tabs rather than expanding them', () => {
    expect(artworkSource('\ta←1\n')).toBe('\ta←1');
  });

  it('preserves blank lines in the middle of a program', () => {
    expect(artworkSource('a←1\n\n\nb←2\n')).toBe('a←1\n\n\nb←2');
  });

  it('trims nothing at either end', () => {
    /*
     * Stated once, plainly: the only characters that may disappear are `\r`
     * and one final `\n`. Everything a `trim` would take is still here.
     */
    const program = '  \n\ta←1  \n\nb←2\t\n';
    expect(artworkSource(program)).toBe('  \n\ta←1  \n\nb←2\t');
  });

  it('changes nothing at all in a program that needs no canonicalising', () => {
    const program = '⍝ Controls\nsize←64\n\nmodulus|∘.×⍨⍳size';
    expect(artworkSource(program)).toBe(program);
  });

  it('is deliberately not idempotent, and is applied exactly once', () => {
    /*
     * Applying it twice removes a second newline, and that is correct rather
     * than a defect: "remove at most one terminal newline" and "preserve an
     * intentional blank final line" are the same clause seen from two sides,
     * and a function that could be applied repeatedly would have to break one
     * of them. What protects the programs is that it is applied once, to the
     * text of a file — enforced by the import test above, which requires every
     * preset to read `artworkSource(source)` and nothing else.
     */
    expect(artworkSource('a←1\n\n')).toBe('a←1\n');
    expect(artworkSource(artworkSource('a←1\n\n'))).toBe('a←1');

    // A program with no terminal newline left to take is already settled.
    for (const program of ['a←1\nb←2', '\ta←1  ', '\na←1']) {
      expect(artworkSource(program)).toBe(program);
    }
  });
});
