/**
 * Interface colours derived from an artwork palette.
 *
 * The contract this holds is numeric, so the tests are too: every token is a
 * colour a browser can paint, every token meets the contrast its role requires
 * against the surfaces that role actually appears on, the same palette always
 * gives the same answer, and nothing a palette can contain — including nothing at
 * all — produces a missing or invalid value.
 *
 * Ratios are computed with the same WCAG helpers the design tokens are checked
 * with, rather than snapshotted, so a change that quietly loses contrast fails
 * here instead of being recorded as the new expectation.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { palettes } from '@/renderer/palettes';
import { paletteFromStops } from '@/renderer/customPalette';
import { AA_BODY, AA_LARGE, contrastRatio } from '@/theme/contrast';
import {
  accentCssVariables,
  defaultAccentTheme,
  deriveInterfaceAccentTheme,
  interfaceAccentThemeForPaletteId,
  INTERFACE_SURFACES,
  type InterfaceAccentTheme,
} from '@/theme/interfaceAccent';
import { hexToOklch } from '@/theme/oklch';

const HEX = /^#[0-9a-f]{6}$/u;

const worst = (hex: string, against: readonly string[]) =>
  against.reduce((low, surface) => Math.min(low, contrastRatio(hex, surface)), Number.POSITIVE_INFINITY);

/** Every promise the theme makes, checked at once. */
function expectUsable(theme: InterfaceAccentTheme): void {
  for (const [name, value] of Object.entries(theme)) {
    if (name === 'derived') continue;
    expect(value, `${name} must be a paintable hex colour`).toMatch(HEX);
  }

  // Text, on the surfaces text appears on.
  expect(worst(theme.text, INTERFACE_SURFACES.light)).toBeGreaterThanOrEqual(AA_BODY);
  expect(worst(theme.textOnDark, INTERFACE_SURFACES.dark)).toBeGreaterThanOrEqual(AA_BODY);

  // Boundaries and other non-text indicators.
  expect(worst(theme.border, INTERFACE_SURFACES.light)).toBeGreaterThanOrEqual(AA_LARGE);
  expect(worst(theme.borderOnDark, INTERFACE_SURFACES.dark)).toBeGreaterThanOrEqual(AA_LARGE);

  // The filled control, which lives on light ground, and its label.
  for (const fill of [theme.solid, theme.solidHover, theme.solidActive]) {
    expect(worst(fill, INTERFACE_SURFACES.light)).toBeGreaterThanOrEqual(AA_LARGE);
    expect(contrastRatio(fill, theme.onSolid)).toBeGreaterThanOrEqual(AA_BODY);
  }
  expect([INTERFACE_SURFACES.textOnLight, INTERFACE_SURFACES.textOnDark]).toContain(theme.onSolid);

  // Tinted backgrounds: close to the surface, and still readable.
  expect(contrastRatio(theme.soft, INTERFACE_SURFACES.textOnLight)).toBeGreaterThanOrEqual(AA_BODY);
  expect(contrastRatio(theme.softOnDark, INTERFACE_SURFACES.textOnDark)).toBeGreaterThanOrEqual(AA_BODY);
  expect(contrastRatio(theme.soft, '#ffffff')).toBeLessThan(2);
  expect(contrastRatio(theme.softOnDark, '#171717')).toBeLessThan(2);

  // The focus ring is seen against the surface behind the control, on both grounds.
  expect(worst(theme.focus, INTERFACE_SURFACES.light)).toBeGreaterThanOrEqual(AA_LARGE);
  expect(worst(theme.focus, INTERFACE_SURFACES.dark)).toBeGreaterThanOrEqual(AA_LARGE);

  // The wordmark's neutral half has to read on whichever ground it sits on.
  expect(worst(theme.logoNeutral, INTERFACE_SURFACES.light)).toBeGreaterThanOrEqual(AA_BODY);
  expect(worst(theme.logoNeutralOnDark, INTERFACE_SURFACES.dark)).toBeGreaterThanOrEqual(AA_BODY);
}

const stops = (colours: readonly string[], positions?: readonly number[]) =>
  paletteFromStops(
    colours.map((colour, index) => ({
      id: `stop-${index}`,
      colour,
      position: positions?.[index] ?? (index * 100) / Math.max(1, colours.length - 1),
    })),
  );

describe('the surfaces the derivation scores against', () => {
  it('match the stylesheet, so the two cannot drift apart', () => {
    const tokens = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'styles', 'tokens.css'), 'utf8');
    const token = (name: string) => {
      const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8});`, 'u').exec(tokens);
      if (match === null) throw new Error(`--${name} is not defined in tokens.css`);
      return (match[1] as string).toLowerCase();
    };

    expect(INTERFACE_SURFACES.light).toEqual([
      token('surface'),
      token('background'),
      token('surface-sunken'),
    ]);
    expect(INTERFACE_SURFACES.dark).toEqual([token('surface-dark'), token('surface-dark-raised')]);
    expect(INTERFACE_SURFACES.textOnLight).toBe(token('text'));
    expect(INTERFACE_SURFACES.textOnDark).toBe(token('text-on-dark'));
    expect(INTERFACE_SURFACES.defaultAccent).toBe(token('accent-orange'));
    expect(INTERFACE_SURFACES.stableFocus).toBe(token('focus'));
  });
});

describe('every built-in palette', () => {
  it.each(palettes.map((palette) => [palette.name, palette] as const))(
    '%s produces a usable theme',
    (_name, palette) => {
      const theme = deriveInterfaceAccentTheme(palette);

      expect(theme.derived).toBe(true);
      expect(palette.colours).toContain(theme.source);
      expectUsable(theme);
    },
  );

  it.each(palettes.map((palette) => [palette.name, palette] as const))(
    '%s gives its filled control three distinct states',
    (_name, palette) => {
      const theme = deriveInterfaceAccentTheme(palette);
      expect(new Set([theme.solid, theme.solidHover, theme.solidActive]).size).toBe(3);
    },
  );

  it('does not simply take the first, last, lightest, darkest or most colourful stop every time', () => {
    /*
     * Any of those rules would be wrong for some palette, so what is asserted is
     * that none of them describes the choice across the whole set. A single
     * palette proves nothing either way — Ember's most colourful stop genuinely
     * is the right source for Ember.
     */
    const chosen = palettes.map((palette) => {
      const theme = deriveInterfaceAccentTheme(palette);
      const colours = palette.colours;
      const byChroma = [...colours].sort((a, b) => hexToOklch(b).c - hexToOklch(a).c);
      const byLightness = [...colours].sort((a, b) => hexToOklch(a).l - hexToOklch(b).l);

      return {
        first: theme.source === colours[0],
        last: theme.source === colours[colours.length - 1],
        darkest: theme.source === byLightness[0],
        lightest: theme.source === byLightness[byLightness.length - 1],
        mostColourful: theme.source === byChroma[0],
      };
    });

    for (const rule of ['first', 'last', 'darkest', 'lightest', 'mostColourful'] as const) {
      expect(chosen.every((palette) => palette[rule])).toBe(false);
    }
  });
});

describe('palettes at the edges', () => {
  it('derives a whole theme from a single colour', () => {
    const theme = deriveInterfaceAccentTheme({ colours: ['#199b9d'] });
    expect(theme.derived).toBe(true);
    expect(theme.source).toBe('#199b9d');
    expectUsable(theme);
  });

  it('handles black and white alone', () => {
    const theme = deriveInterfaceAccentTheme({ colours: ['#000000', '#ffffff'] });
    expect(theme.derived).toBe(true);
    expectUsable(theme);
  });

  it('darkens a very pale palette rather than using it as text', () => {
    const theme = deriveInterfaceAccentTheme({ colours: ['#fff8e1', '#fff1c4', '#ffeaa7'] });

    expect(theme.derived).toBe(true);
    expectUsable(theme);
    // The source is pale; the text token cannot be.
    expect(hexToOklch(theme.text).l).toBeLessThan(hexToOklch(theme.source).l);
    // And it keeps the family: a yellow source must not become a grey.
    expect(hexToOklch(theme.text).c).toBeGreaterThan(0.02);
  });

  it('lightens a very dark palette for use on dark ground', () => {
    const theme = deriveInterfaceAccentTheme({ colours: ['#0a0118', '#160f0a', '#04162e'] });

    expect(theme.derived).toBe(true);
    expectUsable(theme);
    expect(hexToOklch(theme.textOnDark).l).toBeGreaterThan(hexToOklch(theme.source).l);
  });

  it('calms a fluorescent palette for text without draining it', () => {
    const theme = deriveInterfaceAccentTheme({ colours: ['#00ffff', '#ff00ff', '#00ff00'] });

    expectUsable(theme);
    const source = hexToOklch(theme.source);
    const text = hexToOklch(theme.text);
    expect(text.c).toBeLessThan(source.c);
    expect(text.c).toBeGreaterThan(0.03);
  });

  it('accepts a neutral palette without inventing saturation', () => {
    const theme = deriveInterfaceAccentTheme({ colours: ['#222222', '#555555', '#888888', '#bbbbbb'] });

    expect(theme.derived).toBe(true);
    expectUsable(theme);
    // Every derived colour stays grey. Forcing a hue on a grey palette would be
    // inventing a colour the artwork does not contain.
    for (const token of [theme.text, theme.solid, theme.border, theme.focus]) {
      expect(hexToOklch(token).c).toBeLessThan(0.02);
    }
  });

  it('treats a repeated colour as one candidate', () => {
    const once = deriveInterfaceAccentTheme({ colours: ['#199b9d', '#eafbf8'] });
    const thrice = deriveInterfaceAccentTheme({ colours: ['#199b9d', '#199b9d', '#eafbf8', '#199b9d'] });

    expect(thrice).toEqual(once);
  });

  it('ignores where the stops sit, including two at the same place', () => {
    const colours = ['#04262b', '#199b9d', '#eafbf8'];
    const evenly = deriveInterfaceAccentTheme(stops(colours));
    const bunched = deriveInterfaceAccentTheme(stops(colours, [0, 40, 40]));
    const reversed = deriveInterfaceAccentTheme(stops(colours, [100, 50, 0]));

    // Same colours, so the same theme, wherever the stops are and whatever
    // order normalising puts them in.
    expect(bunched.source).toBe(evenly.source);
    expect(reversed.source).toBe(evenly.source);
    expect(bunched).toEqual(evenly);
  });

  it('is unmoved by the order the colours arrive in', () => {
    const colours = ['#160f0a', '#6b3410', '#ff6a13', '#ffc39a'];
    const forwards = deriveInterfaceAccentTheme({ colours });
    const backwards = deriveInterfaceAccentTheme({ colours: [...colours].reverse() });

    expect(backwards).toEqual(forwards);
  });
});

describe('input it cannot use', () => {
  const fallback = defaultAccentTheme();

  it.each([
    ['no palette at all', null],
    ['an undefined palette', undefined],
    ['a palette with no colours field', {}],
    ['an empty list', { colours: [] }],
    ['colours that are not colours', { colours: ['not a colour', '', '#gg0011', '12345'] }],
    ['values that are not strings', { colours: [null, undefined, 42, {}, []] }],
    ['an eight-digit colour with alpha', { colours: ['#11223344'] }],
  ])('falls back for %s', (_case, palette) => {
    const theme = deriveInterfaceAccentTheme(palette as never);

    expect(theme.derived).toBe(false);
    expect(theme).toEqual(fallback);
    expectUsable(theme);
  });

  it('uses the readable colours and ignores the rest', () => {
    // What a half-typed colour field looks like: one good value, one in progress.
    const theme = deriveInterfaceAccentTheme({ colours: ['#199b9d', '#19'] });

    expect(theme.derived).toBe(true);
    expect(theme.source).toBe('#199b9d');
    expectUsable(theme);
  });

  it('keeps the theme it is given while the palette is unusable', () => {
    /*
     * How the interface stays still while somebody edits a colour: the caller
     * passes the last theme that worked, and gets it back unchanged rather than a
     * flash of the default orange.
     */
    const lastGood = deriveInterfaceAccentTheme({ colours: ['#199b9d'] });
    const during = deriveInterfaceAccentTheme({ colours: ['#'] }, INTERFACE_SURFACES, lastGood);

    expect(during).toEqual(lastGood);
  });

  it('replaces unusable surfaces rather than producing unusable tokens', () => {
    const theme = deriveInterfaceAccentTheme({ colours: ['#199b9d'] }, {
      light: ['nonsense'],
      dark: [],
      textOnLight: '',
      textOnDark: 'rgb(1,2,3)',
      defaultAccent: 'orange',
      logoNeutral: '#zzz',
      stableFocus: '',
    } as never);

    expectUsable(theme);
  });

  it('accepts a three-digit colour, as the palette editor does', () => {
    const theme = deriveInterfaceAccentTheme({ colours: ['#19b'] });
    expect(theme.derived).toBe(true);
    expect(theme.source).toBe('#1199bb');
  });
});

describe('determinism', () => {
  it('gives the same answer every time for every built-in palette', () => {
    for (const palette of palettes) {
      const first = deriveInterfaceAccentTheme(palette);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(deriveInterfaceAccentTheme(palette)).toEqual(first);
      }
    }
  });

  it('pins Ember exactly, so a change to the algorithm has to be deliberate', () => {
    expect(deriveInterfaceAccentTheme(palettes[0])).toEqual({
      source: '#ff6a13',
      solid: '#bc4900',
      solidHover: '#a54000',
      solidActive: '#8f3600',
      onSolid: '#f2f0ee',
      text: '#aa5026',
      textOnDark: '#e18259',
      border: '#d8652d',
      borderOnDark: '#ee7943',
      soft: '#fff0ea',
      softOnDark: '#462313',
      focus: '#e15e14',
      logoNeutral: '#4a4a4a',
      logoNeutralOnDark: '#8a8a8a',
      derived: true,
    });
  });

  it('pins the source chosen for each built-in palette', () => {
    const sources = Object.fromEntries(
      palettes.map((palette) => [palette.id, deriveInterfaceAccentTheme(palette).source]),
    );

    expect(sources).toEqual({
      ember: '#ff6a13',
      mono: '#8d8d8d',
      poolrooms: '#199b9d',
      neon: '#d926c9',
      sunset: '#e05f4f',
      forest: '#74ad4c',
      blueprint: '#4a95cf',
      heat: '#ee605e',
      abyss: '#1d5fa8',
    });
  });
});

describe('the default theme', () => {
  it('is built from the established accent and says it was not derived', () => {
    const theme = defaultAccentTheme();

    expect(theme.source).toBe(INTERFACE_SURFACES.defaultAccent);
    expect(theme.derived).toBe(false);
    expectUsable(theme);
  });

  it('leaves the semantic colours alone', () => {
    /*
     * Nothing in a theme may collide with error, warning or success. They are
     * absent from the token set by construction — this asserts the construction,
     * so adding a palette-derived status colour later has to break a test.
     */
    const semantic = ['#b42318', '#8f5700', '#18794e'];
    const names = Object.keys(accentCssVariables(defaultAccentTheme()));

    expect(names.some((name) => /error|warning|success|danger/u.test(name))).toBe(false);
    for (const theme of palettes.map((palette) => deriveInterfaceAccentTheme(palette))) {
      expect(semantic).not.toContain(theme.solid);
      expect(semantic).not.toContain(theme.text);
    }
  });
});

describe('palette identifiers', () => {
  it('themes a named palette', () => {
    expect(interfaceAccentThemeForPaletteId('poolrooms').source).toBe('#199b9d');
  });

  it('follows the dyalog to ember rename, rather than falling back', () => {
    const migrated = interfaceAccentThemeForPaletteId('dyalog');

    expect(migrated).toEqual(interfaceAccentThemeForPaletteId('ember'));
    expect(migrated.derived).toBe(true);
    expect(migrated.source).toBe('#ff6a13');
  });

  it('themes an unknown id as the default palette does, not as a failure', () => {
    expect(interfaceAccentThemeForPaletteId('no-such-palette')).toEqual(
      interfaceAccentThemeForPaletteId('ember'),
    );
  });
});

describe('accentCssVariables', () => {
  it('names every token, and every value is paintable', () => {
    const variables = accentCssVariables(deriveInterfaceAccentTheme(palettes[2]));

    expect(Object.keys(variables)).toEqual([
      '--ui-accent-source',
      '--ui-accent-solid',
      '--ui-accent-solid-hover',
      '--ui-accent-solid-active',
      '--ui-accent-on-solid',
      '--ui-accent-text',
      '--ui-accent-text-on-dark',
      '--ui-accent-border',
      '--ui-accent-border-on-dark',
      '--ui-accent-soft',
      '--ui-accent-soft-on-dark',
      '--ui-accent-focus',
      '--logo-neutral',
      '--logo-neutral-on-dark',
    ]);

    for (const [name, value] of Object.entries(variables)) {
      expect(value, name).toMatch(HEX);
    }
  });

  it('covers every colour the theme holds', () => {
    const theme = deriveInterfaceAccentTheme(palettes[3]);
    const values = new Set(Object.values(accentCssVariables(theme)));

    for (const [name, value] of Object.entries(theme)) {
      if (name === 'derived') continue;
      expect(values, `${name} is missing from the custom properties`).toContain(value);
    }
  });
});
