/**
 * How APL Art describes itself.
 *
 * Naming Dyalog APL as the language is correct and encouraged — it is what the
 * code is written in. Presenting the project as a company's product is not, and
 * the difference is a matter of specific phrases rather than a banned word. A
 * test that rejected every occurrence of "Dyalog" would forbid the accurate
 * statements along with the misleading ones.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE_ID, canonicalPaletteId, getPalette, palettes } from '@/renderer/palettes';
import { captionLinesFor } from '@/presets/codeMetrics';
import { migrateProject } from '@/storage/storageMigrations';
import { decodeShareState } from '@/sharing/decodeShareState';
import { encodeShareState } from '@/sharing/encodeShareState';
import { PROJECT_SCHEMA_VERSION } from '@/storage/ProjectRepository';
import { defaultRenderOptions } from '@/renderer/renderOptions';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** Every source and documentation file whose text a visitor could read. */
function publicTextFiles(): string[] {
  const found: string[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (/\.(tsx?|css|md|html)$/u.test(entry)) {
        found.push(path);
      }
    }
  };

  walk(join(REPO_ROOT, 'src'));
  found.push(join(REPO_ROOT, 'README.md'), join(REPO_ROOT, 'index.html'));
  return found;
}

/**
 * Claims that would misrepresent who makes or backs APL Art.
 *
 * Each is a phrase, not a word: the point is to catch a false relationship
 * being asserted, not to police an accurate mention of the language.
 */
const PROHIBITED = [
  /\bDyalog Ltd\b/iu,
  /\bofficial Dyalog\b/iu,
  /\bteam at Dyalog\b/iu,
  /\bbuilt by Dyalog\b/iu,
  /\bDyalog employee\b/iu,
  /\bfrom the team at\b/iu,
  /\bsponsored by Dyalog\b/iu,
  /\bendorsed by Dyalog\b/iu,
  /\ba Dyalog project\b/iu,
  /\bDyalog campaign\b/iu,
];

describe('public wording', () => {
  const files = publicTextFiles();

  it('finds files to check, so a passing result is not vacuous', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(PROHIBITED.map((pattern) => [pattern.source, pattern] as const))(
    'never claims %s',
    (_label, pattern) => {
      const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
      expect(offenders.map((file) => file.replace(REPO_ROOT, ''))).toEqual([]);
    },
  );

  it('still names the language, because that is accurate', () => {
    const about = readFileSync(join(REPO_ROOT, 'src', 'pages', 'AboutPage.tsx'), 'utf8');
    expect(about).toContain('Dyalog APL');
  });

  it('describes TryAPL as the execution service without saying whose it is', () => {
    const about = readFileSync(join(REPO_ROOT, 'src', 'pages', 'AboutPage.tsx'), 'utf8');
    expect(about).toContain('TryAPL');
    expect(about).not.toMatch(/TryAPL[^.]{0,80}free service from/u);
  });

  it('does not name Brian Becker’s employer', () => {
    // The acknowledgement is for the ideas, and naming an employer would imply
    // an involvement that does not exist.
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (!/Becker/u.test(text)) continue;
      expect(text, file).not.toMatch(/Becker[^.]{0,120}(Ltd|employer|works at|employed)/iu);
    }
  });
});

describe('the palette formerly called Dyalog', () => {
  it('is presented as Ember', () => {
    expect(getPalette('ember').name).toBe('Ember');
    expect(DEFAULT_PALETTE_ID).toBe('ember');
  });

  it('is not offered under a company name', () => {
    for (const palette of palettes) {
      expect(palette.id).not.toBe('dyalog');
      expect(palette.name).not.toBe('Dyalog');
    }
  });

  it('keeps the warm accent colour it always had', () => {
    expect(getPalette('ember').colours).toContain('#ff6a13');
  });

  it('redirects the old id rather than dropping it', () => {
    expect(canonicalPaletteId('dyalog')).toBe('ember');
    expect(canonicalPaletteId('mono')).toBe('mono');
    expect(getPalette('dyalog').id).toBe('ember');
  });
});

describe('compatibility across the rename', () => {
  it('restores a project saved under the old palette id', () => {
    const outcome = migrateProject({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: 'preset:modular-bloom',
      sourcePresetId: 'modular-bloom',
      title: 'Modular Bloom',
      code: 'size←64\nsize size⍴1',
      parameterValues: {},
      paletteId: 'dyalog',
      renderOptions: defaultRenderOptions('dyalog'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // Redirected, not reset to the default by coincidence.
      expect(outcome.project.paletteId).toBe('ember');
      expect(outcome.project.renderOptions.paletteId).toBe('ember');
    }
  });

  it('opens a shared link written under the old palette id', () => {
    const encoded = encodeShareState({
      v: 1,
      preset: 'modular-bloom',
      code: 'size←64\nsize size⍴1',
      params: {},
      palette: 'dyalog',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    const decoded = decodeShareState(encoded);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.state.palette).toBe('ember');
  });

  it('still falls back for a palette that never existed', () => {
    const encoded = encodeShareState({
      v: 1,
      preset: 'modular-bloom',
      code: 'x←1\n2 2⍴1',
      params: {},
      palette: 'invented',
      render: { invert: false, rotation: 0, mirrorH: false, mirrorV: false, smooth: false },
    });

    const decoded = decodeShareState(encoded);
    expect(decoded.ok && decoded.state.palette).toBe('ember');
  });
});

describe('export captions', () => {
  it('name the language, not a company', () => {
    const lines = captionLinesFor('Modular Bloom', 'size←4 ⋄ size size⍴1');
    expect(lines[1]).toMatch(/^Generated with \d+ characters of Dyalog APL$/u);
    expect(lines.join(' ')).not.toMatch(/Ltd|official|sponsored|endorsed/iu);
  });
});
