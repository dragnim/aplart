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
    'mandelbrot-field': { digest: '8ca8df188fb7', characters: 625, lines: 19 },
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

  it('leaves leading blank lines alone', () => {
    expect(artworkSource('\na←1\n')).toBe('\na←1');
  });

  it('survives a checkout that ignored .gitattributes', () => {
    expect(artworkSource('a←1\r\nb←2\r\n')).toBe('a←1\nb←2');
  });
});
