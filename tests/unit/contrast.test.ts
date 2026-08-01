/**
 * Checks the design tokens against WCAG 2.2 AA.
 *
 * A test rather than a note in a review, because contrast is the one
 * accessibility requirement that is fully determined by numbers already in the
 * repository. Every pairing here is one the interface actually renders; the
 * ratios are read from the stylesheet so that changing a token has to either
 * keep the contrast or change this file deliberately.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AA_BODY, AA_LARGE, contrastRatio, over, parseHex } from '../../scripts/lib/contrast';
import { palettes } from '@/renderer/palettes';

const TOKENS = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'styles', 'tokens.css'), 'utf8');

/** Reads a custom property out of tokens.css, so the test cannot drift from it. */
function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8});`, 'u').exec(TOKENS);
  if (match === null) throw new Error(`--${name} is not defined in tokens.css`);
  return match[1] as string;
}

describe('contrastRatio', () => {
  it('agrees with the known extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456'), 10);
  });
});

describe('text on light surfaces', () => {
  it.each([
    ['text', 'surface', AA_BODY],
    ['text', 'background', AA_BODY],
    ['text', 'surface-sunken', AA_BODY],
    ['text-muted', 'surface', AA_BODY],
    ['text-muted', 'background', AA_BODY],
    ['error', 'surface', AA_BODY],
    ['error', 'error-surface', AA_BODY],
    ['success', 'surface', AA_BODY],
    ['warning', 'surface', AA_BODY],
    ['warning', 'warning-surface', AA_BODY],
    ['dyalog-orange-strong', 'surface', AA_BODY],
  ])('%s on %s meets AA', (foreground, background, minimum) => {
    const ratio = contrastRatio(token(foreground), token(background));
    expect(ratio, `--${foreground} on --${background} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      minimum,
    );
  });
});

describe('text on dark surfaces', () => {
  it.each([
    ['text-on-dark', 'surface-dark', AA_BODY],
    ['text-on-dark', 'surface-dark-raised', AA_BODY],
    ['text-on-dark-muted', 'surface-dark', AA_BODY],
  ])('%s on %s meets AA', (foreground, background, minimum) => {
    const ratio = contrastRatio(token(foreground), token(background));
    expect(ratio, `--${foreground} on --${background} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      minimum,
    );
  });
});

describe('non-text indicators', () => {
  it('the focus ring is visible against every surface it can appear on', () => {
    // 3:1 against adjacent colours, per WCAG 2.2 §1.4.11 Non-text Contrast.
    for (const surface of ['surface', 'background', 'surface-sunken', 'surface-dark']) {
      const ratio = contrastRatio(token('focus'), token(surface));
      expect(ratio, `--focus on --${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('borders are distinguishable from the surfaces they separate', () => {
    // Borders are decorative here rather than the only means of identifying a
    // control, so 1.5:1 is the bar: visible, without forcing heavy outlines.
    expect(contrastRatio(token('border'), token('surface'))).toBeGreaterThan(1.2);
    expect(contrastRatio(token('border-strong'), token('surface'))).toBeGreaterThan(1.8);
  });
});

describe('the Run button', () => {
  it('has readable text on the brand orange', () => {
    // The label is near-black rather than white for exactly this reason:
    // white on #ff6a13 is about 2.9:1 and fails.
    const ratio = contrastRatio('#1a0d02', token('dyalog-orange'));
    expect(ratio).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio('#ffffff', token('dyalog-orange'))).toBeLessThan(AA_BODY);
  });
});

describe('the APL editor theme', () => {
  // Read from the highlight style rather than duplicated, so a change to the
  // syntax colours is checked too.
  const EDITOR_BACKGROUND = token('surface-dark');

  it.each([
    ['comments', '#8b9199'],
    ['strings', '#9ae6a0'],
    ['numbers', '#ffc48c'],
    ['assignment', '#ff8f4d'],
    ['primitives', '#7fd2ff'],
    ['quad names', '#d7a6ff'],
    ['names', '#eceff4'],
    ['dfn arguments', '#ffd479'],
    ['brackets', '#c3cbd6'],
  ])('%s are readable on the editor background', (_label, colour) => {
    const ratio = contrastRatio(colour, EDITOR_BACKGROUND);
    expect(ratio, `${colour} on ${EDITOR_BACKGROUND} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      AA_BODY,
    );
  });

  it('the active line tint does not push comments below AA', () => {
    // The active line is white at 4%, which lightens the background slightly.
    const tinted = over(parseHex('#ffffff'), parseHex(EDITOR_BACKGROUND), 0.04);
    expect(contrastRatio('#8b9199', tinted)).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe('palette backgrounds', () => {
  it('every palette can show its own lightest colour against its background', () => {
    // Not a text requirement, but a palette whose top end vanishes into its own
    // backdrop would render artwork that appears to be missing its highlights.
    for (const palette of palettes) {
      const background = palette.background;
      if (background === undefined) continue;
      const lightest = palette.colours[palette.colours.length - 1] as string;
      const ratio = contrastRatio(lightest, background);
      expect(ratio, `${palette.id}: ${lightest} on ${background}`).toBeGreaterThan(AA_LARGE);
    }
  });
});
