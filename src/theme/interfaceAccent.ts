/**
 * Turning the artwork's palette into interface colours that are safe to use.
 *
 * A palette is chosen to look good as a picture, which is a different job from
 * being readable as text on a white panel or visible as a filled button on a
 * near-black one. So no palette colour is used as an interface colour directly.
 * One is chosen as the *source*, and each role — text, border, filled control,
 * focus ring, tinted background — is derived from it by moving lightness and
 * chroma in OKLCH until it meets the contrast that role needs, keeping the hue
 * so the result still reads as belonging to the palette.
 *
 * Two things about this file are deliberate and worth not undoing:
 *
 * It is pure. No DOM, no React, no canvas, no clock, no randomness: the same
 * palette and the same surfaces always produce the same tokens, which is what
 * lets an animated artwork leave the interface alone. Nothing here samples what
 * was rendered; the palette *definition* is the only input.
 *
 * Roles that sit on different backgrounds get different tokens. This application
 * puts text and boundaries on white panels and on a near-black editor, symbol
 * toolbar and canvas frame, and no single colour reaches 4.5:1 against both
 * #ffffff and #232323 — that requirement is a contradiction, not a hard problem.
 * Rather than split the difference and fail both, `text` and `textOnDark` are
 * separate tokens, as are `border`/`borderOnDark` and `soft`/`softOnDark`.
 *
 * The filled control is *not* one of those pairs, because filled controls only
 * ever sit on light ground here: the panels are `--surface`, and so is the
 * Focus-mode drawer, even though the page behind it is dark. What the dark
 * surfaces carry is accent text and accent boundaries, which have their own
 * tokens above. Requiring the fill to survive both grounds as well — an earlier
 * draft of this file did — leaves a band of about six thousandths of a unit of
 * luminance in which every palette produces the same muddy colour and no room is
 * left for a hover state. Scoring each token against the surfaces it is actually
 * used on is what keeps the palettes distinguishable.
 */

import { normaliseColour } from '@/renderer/customPalette';
import { canonicalPaletteId, getPalette } from '@/renderer/palettes';
import { AA_BODY, AA_LARGE, contrastRatio } from './contrast';
import { clamp, deltaEok, hexToOklch, oklchToHex, withChroma, withLightness, type Oklch } from './oklch';

/**
 * The interface colours a theme has to work against.
 *
 * Passed in rather than read from the stylesheet, because reading the stylesheet
 * would mean touching the DOM. `tests/unit/interfaceAccent.test.ts` asserts that
 * these match `tokens.css`, so the two cannot drift apart unnoticed.
 */
export interface InterfaceSurfaces {
  /** Every light background an accent can land on. */
  readonly light: readonly string[];
  /** Every dark background an accent can land on. */
  readonly dark: readonly string[];
  readonly textOnLight: string;
  readonly textOnDark: string;
  /** Used when a palette cannot supply one. */
  readonly defaultAccent: string;
  /** The wordmark's stable half. Never palette-derived. */
  readonly logoNeutral: string;
  /** The established focus colour, kept when no derived one is safe. */
  readonly stableFocus: string;
}

export const INTERFACE_SURFACES: InterfaceSurfaces = {
  light: ['#ffffff', '#f4f3f1', '#eceae7'],
  dark: ['#171717', '#232323'],
  textOnLight: '#1e1e1e',
  textOnDark: '#f2f0ee',
  defaultAccent: '#ff6a13',
  logoNeutral: '#4a4a4a',
  stableFocus: '#526cfe',
};

export interface InterfaceAccentTheme {
  /** The palette colour this was built from, unmodified. Never used for contrast. */
  readonly source: string;
  readonly solid: string;
  readonly solidHover: string;
  readonly solidActive: string;
  /** Text and icons on `solid`. One of the interface's own text colours. */
  readonly onSolid: string;
  readonly text: string;
  readonly textOnDark: string;
  readonly border: string;
  readonly borderOnDark: string;
  readonly soft: string;
  readonly softOnDark: string;
  readonly focus: string;
  readonly logoNeutral: string;
  readonly logoNeutralOnDark: string;
  /** False when the palette supplied nothing usable and the fallback answered. */
  readonly derived: boolean;
}

/** Anything with a `colours` array, however untrustworthy its contents. */
export interface PaletteColours {
  readonly colours?: readonly unknown[] | undefined;
}

/*
 * Chroma ceilings per role.
 *
 * An intense cyan is fine as a picture and tiring as body text, so text and
 * tinted backgrounds are allowed less of it than a filled control. These are
 * ceilings, not targets: a quiet palette stays quiet.
 */
const MAX_CHROMA = {
  text: 0.13,
  solid: 0.19,
  border: 0.16,
  soft: 0.045,
  softOnDark: 0.06,
  focus: 0.18,
} as const;

/** Lightness resolution of the searches below. */
const STEP = 0.002;

/**
 * How far hover and pressed states move, in lightness.
 *
 * The resting fill has to have room for both of them in the same direction, or
 * the states are indistinguishable from it — which is what happens if the fill is
 * chosen purely for closeness to the palette colour and lands on the boundary of
 * what is legible.
 */
const STATE_DELTAS = [0.05, 0.1] as const;

/** How far a tinted background may stand out from the surface it tints. */
const SOFT_CONTRAST = { min: 1.02, max: 1.9 } as const;

function worstContrast(hex: string, against: readonly string[]): number {
  if (against.length === 0) return Number.POSITIVE_INFINITY;
  return against.reduce(
    (worst, surface) => Math.min(worst, contrastRatio(hex, surface)),
    Number.POSITIVE_INFINITY,
  );
}

interface Adjusted {
  readonly hex: string;
  readonly lightness: number;
}

/**
 * The lightness nearest `preferred` whose colour passes `acceptable`.
 *
 * Searched outward from `preferred` rather than swept from black to white, for
 * two reasons. It answers in a few steps instead of five hundred, which is the
 * difference between keeping up with a dragged colour picker and not. And it
 * returns the lightness it settled on, so a caller deriving hover and pressed
 * states from the resting fill works from the colour that was actually chosen —
 * an earlier version recorded whichever candidate the predicate happened to
 * accept last, which is why one palette's hover came back all but identical to
 * its resting state.
 *
 * Not a binary search: the constraints are not monotonic in lightness. A filled
 * control has to stay visible against the palest surface *and* keep its label
 * readable, which bounds it from both directions and can leave two separate
 * intervals. Stepping outward needs no such assumption, and taking the darker
 * side first at equal distance keeps the answer independent of anything but the
 * inputs.
 */
function nearestLightness(
  base: Oklch,
  preferred: number,
  acceptable: (hex: string, lightness: number) => boolean,
  step: number = STEP,
): Adjusted | null {
  const start = clamp(preferred, 0, 1);

  const test = (lightness: number): Adjusted | null => {
    if (lightness < 0 || lightness > 1) return null;
    const hex = oklchToHex(withLightness(base, lightness));
    return acceptable(hex, lightness) ? { hex, lightness } : null;
  };

  const here = test(start);
  if (here !== null) return here;

  const steps = Math.round(1 / step);
  for (let offset = 1; offset <= steps; offset += 1) {
    const distance = offset * step;
    const darker = test(start - distance);
    if (darker !== null) return darker;
    const lighter = test(start + distance);
    if (lighter !== null) return lighter;
  }

  return null;
}

function capped(source: Oklch, ceiling: number): Oklch {
  return withChroma(source, Math.min(source.c, ceiling));
}

function textAccent(source: Oklch, surfaces: InterfaceSurfaces): string {
  const base = capped(source, MAX_CHROMA.text);
  return (
    nearestLightness(base, source.l, (hex) => worstContrast(hex, surfaces.light) >= AA_BODY)?.hex ??
    // Unreachable for any hue — black satisfies it — but a token must exist.
    surfaces.textOnLight
  );
}

function textOnDarkAccent(source: Oklch, surfaces: InterfaceSurfaces): string {
  const base = capped(source, MAX_CHROMA.text);
  return (
    nearestLightness(base, source.l, (hex) => worstContrast(hex, surfaces.dark) >= AA_BODY)?.hex ??
    surfaces.textOnDark
  );
}

function borderAccent(source: Oklch, against: readonly string[], ifNone: string): string {
  const base = capped(source, MAX_CHROMA.border);
  return nearestLightness(base, source.l, (hex) => worstContrast(hex, against) >= AA_LARGE)?.hex ?? ifNone;
}

interface SolidAccent {
  readonly solid: string;
  readonly onSolid: string;
  readonly hover: string;
  readonly active: string;
}

/**
 * The filled control, its label, and its two states.
 *
 * Two constraints on the fill: 3:1 against every light surface, since that is
 * where filled controls live, and 4.5:1 against whichever of the interface's text
 * colours goes on top. The second rules out a band of middling lightness where
 * neither the dark nor the light text reads, so the acceptable region is two
 * intervals — a dark fill with a light label, or a light fill with a dark one.
 *
 * A third constraint is what makes the states work: the fill must have room to
 * move for hover and pressed *without* leaving the acceptable region, and in one
 * consistent direction so the two states do not straddle the resting colour.
 * Without it the search returns whichever legible lightness is nearest the
 * palette colour, which is reliably a boundary with nothing beyond it, and hover
 * comes back identical to rest. Preferring darker matches what a pressed control
 * usually does; lighter is accepted when the fill is already near black.
 */
function solidAccent(source: Oklch, surfaces: InterfaceSurfaces): SolidAccent {
  const base = capped(source, MAX_CHROMA.solid);
  const at = (lightness: number) => oklchToHex(withLightness(base, lightness));

  const labelFor = (hex: string) =>
    contrastRatio(hex, surfaces.textOnDark) >= contrastRatio(hex, surfaces.textOnLight)
      ? surfaces.textOnDark
      : surfaces.textOnLight;

  const legible = (hex: string) =>
    worstContrast(hex, surfaces.light) >= AA_LARGE && contrastRatio(hex, labelFor(hex)) >= AA_BODY;

  /** Legible, and still readable with the resting fill's own label colour. */
  const holds = (lightness: number, label: string) =>
    lightness >= 0 &&
    lightness <= 1 &&
    legible(at(lightness)) &&
    contrastRatio(at(lightness), label) >= AA_BODY;

  const roomInDirection = (lightness: number, label: string, direction: -1 | 1) =>
    STATE_DELTAS.every((delta) => holds(lightness + direction * delta, label));

  const withRoom = nearestLightness(
    base,
    source.l,
    (hex, lightness) =>
      legible(hex) &&
      (roomInDirection(lightness, labelFor(hex), -1) || roomInDirection(lightness, labelFor(hex), 1)),
  );

  if (withRoom !== null) {
    const label = labelFor(withRoom.hex);
    // Darker for the states where that works, which is what a pressed control
    // usually does; lighter when the fill is already close to black.
    const direction: -1 | 1 = roomInDirection(withRoom.lightness, label, -1) ? -1 : 1;
    const [hoverDelta = 0.05, activeDelta = 0.1] = STATE_DELTAS;

    return {
      solid: withRoom.hex,
      onSolid: label,
      hover: at(withRoom.lightness + direction * hoverDelta),
      active: at(withRoom.lightness + direction * activeDelta),
    };
  }

  /*
   * No lightness had room for both states on either side, which a palette of
   * pure black and white can produce. The fill is then whatever is legible and
   * nearest, and the states match it: an unchanging hover is a smaller fault
   * than an unreadable label, and nothing in this interface signals state by
   * colour alone.
   */
  const solid = nearestLightness(base, source.l, (hex) => legible(hex))?.hex ?? surfaces.defaultAccent;
  return { solid, onSolid: labelFor(solid), hover: solid, active: solid };
}

/** A tint of the surface, not a colour in its own right. */
function softAccent(
  source: Oklch,
  surface: string,
  preferred: number,
  ceiling: number,
  textOn: string,
): string {
  const base = capped(source, ceiling);

  const acceptable = (hex: string) => {
    const standout = contrastRatio(hex, surface);
    return (
      standout >= SOFT_CONTRAST.min && standout <= SOFT_CONTRAST.max && contrastRatio(hex, textOn) >= AA_BODY
    );
  };

  return (
    nearestLightness(base, preferred, acceptable)?.hex ??
    oklchToHex(withChroma(withLightness(base, preferred), 0.02))
  );
}

/**
 * The focus ring, or the established one when no derived colour is safe.
 *
 * The ring is `3px solid` with `outline-offset: 2px`, so what it is seen against
 * is the surface behind the control rather than the control itself — and the same
 * ring appears on light panels and on the dark editor and canvas frame. So it
 * must clear 3:1 against every one of them, which is a real constraint but not a
 * contradictory one. When a palette cannot manage it, keeping `--focus`
 * unchanged is the specified behaviour: a focus indicator nobody can see is
 * worse than one that does not match the artwork.
 */
function focusAccent(source: Oklch, surfaces: InterfaceSurfaces): string {
  const base = capped(source, MAX_CHROMA.focus);

  const found = nearestLightness(
    base,
    source.l,
    (hex) => worstContrast(hex, surfaces.light) >= AA_LARGE && worstContrast(hex, surfaces.dark) >= AA_LARGE,
  );

  return found?.hex ?? surfaces.stableFocus;
}

/** The wordmark's neutral half, adjusted only enough to be read on each ground. */
function logoNeutrals(surfaces: InterfaceSurfaces): { readonly onLight: string; readonly onDark: string } {
  const base = hexToOklch(validColour(surfaces.logoNeutral) ?? INTERFACE_SURFACES.logoNeutral);

  return {
    onLight:
      nearestLightness(base, base.l, (hex) => worstContrast(hex, surfaces.light) >= AA_BODY)?.hex ??
      surfaces.textOnLight,
    onDark:
      nearestLightness(base, base.l, (hex) => worstContrast(hex, surfaces.dark) >= AA_BODY)?.hex ??
      surfaces.textOnDark,
  };
}

function validColour(value: unknown): string | null {
  return typeof value === 'string' ? normaliseColour(value) : null;
}

/** Greys the accent should not be mistaken for. */
function interfaceNeutrals(surfaces: InterfaceSurfaces): readonly Oklch[] {
  return [
    ...surfaces.light,
    ...surfaces.dark,
    surfaces.textOnLight,
    surfaces.textOnDark,
    surfaces.logoNeutral,
  ]
    .map((colour) => validColour(colour))
    .filter((colour): colour is string => colour !== null)
    .map(hexToOklch);
}

/**
 * How suitable a palette colour is as the source of the theme.
 *
 * Three pulls, and the balance between them is the whole of the choice:
 *
 * *Chroma*, because an accent should be recognisable as a colour — but capped,
 * so a fluorescent pink is not preferred over a good red merely for being louder.
 *
 * *Distance from the interface's own greys*, so a palette's near-white or
 * near-black ends do not become an accent indistinguishable from a panel or a
 * border.
 *
 * *Fidelity*, subtracted: how far the colour has to move to do the jobs asked of
 * it. This is what stops the extremes winning. A palette's palest tint can be
 * made into readable text, but only by becoming a different colour, and a
 * candidate that already sits where the roles need it is a better source than one
 * that merely looks striking in the ramp.
 */
function score(candidate: Oklch, surfaces: InterfaceSurfaces, neutrals: readonly Oklch[]): number {
  const chroma = Math.min(candidate.c, 0.16) / 0.16;

  const distinctiveness =
    neutrals.length === 0
      ? 1
      : Math.min(
          0.35,
          neutrals.reduce(
            (nearest, neutral) => Math.min(nearest, deltaEok(candidate, neutral)),
            Number.POSITIVE_INFINITY,
          ),
        ) / 0.35;

  const roles = [
    textAccent(candidate, surfaces),
    textOnDarkAccent(candidate, surfaces),
    solidAccent(candidate, surfaces).solid,
  ];
  const drift = roles.reduce((total, hex) => total + deltaEok(candidate, hexToOklch(hex)), 0) / roles.length;
  const fidelity = clamp(drift / 0.5, 0, 1);

  return 0.5 * chroma + 0.3 * distinctiveness - 0.35 * fidelity;
}

function themeFrom(sourceHex: string, surfaces: InterfaceSurfaces, derived: boolean): InterfaceAccentTheme {
  const source = hexToOklch(sourceHex);
  const fill = solidAccent(source, surfaces);
  const neutrals = logoNeutrals(surfaces);
  const lightSurface = surfaces.light[0] ?? INTERFACE_SURFACES.light[0] ?? '#ffffff';
  const darkSurface = surfaces.dark[0] ?? INTERFACE_SURFACES.dark[0] ?? '#171717';

  return {
    source: sourceHex,
    solid: fill.solid,
    solidHover: fill.hover,
    solidActive: fill.active,
    onSolid: fill.onSolid,
    text: textAccent(source, surfaces),
    textOnDark: textOnDarkAccent(source, surfaces),
    border: borderAccent(source, surfaces.light, surfaces.textOnLight),
    borderOnDark: borderAccent(source, surfaces.dark, surfaces.textOnDark),
    soft: softAccent(source, lightSurface, 0.965, MAX_CHROMA.soft, surfaces.textOnLight),
    softOnDark: softAccent(source, darkSurface, 0.3, MAX_CHROMA.softOnDark, surfaces.textOnDark),
    focus: focusAccent(source, surfaces),
    logoNeutral: neutrals.onLight,
    logoNeutralOnDark: neutrals.onDark,
    derived,
  };
}

/** Replaces anything unusable in the caller's surfaces with the standard ones. */
function sanitise(surfaces: InterfaceSurfaces): InterfaceSurfaces {
  const list = (values: readonly string[], fallback: readonly string[]) => {
    const valid = values
      .map((value) => validColour(value))
      .filter((value): value is string => value !== null);
    return valid.length > 0 ? valid : fallback;
  };
  const one = (value: string, fallback: string) => validColour(value) ?? fallback;

  return {
    light: list(surfaces.light, INTERFACE_SURFACES.light),
    dark: list(surfaces.dark, INTERFACE_SURFACES.dark),
    textOnLight: one(surfaces.textOnLight, INTERFACE_SURFACES.textOnLight),
    textOnDark: one(surfaces.textOnDark, INTERFACE_SURFACES.textOnDark),
    defaultAccent: one(surfaces.defaultAccent, INTERFACE_SURFACES.defaultAccent),
    logoNeutral: one(surfaces.logoNeutral, INTERFACE_SURFACES.logoNeutral),
    stableFocus: one(surfaces.stableFocus, INTERFACE_SURFACES.stableFocus),
  };
}

/** The theme used wherever no artwork palette is active, and when one fails. */
export function defaultAccentTheme(surfaces: InterfaceSurfaces = INTERFACE_SURFACES): InterfaceAccentTheme {
  const safe = sanitise(surfaces);
  return themeFrom(safe.defaultAccent, safe, false);
}

/**
 * The interface theme for a palette.
 *
 * Returns `fallback` — the default APL Art theme unless the caller says
 * otherwise — when the palette holds no colour this can use: absent, empty, all
 * unparseable, or mid-edit with an incomplete value typed into it. Partly valid
 * is not a failure: the readable colours are used and the rest ignored, which is
 * what keeps the interface still while somebody is typing into a colour field.
 */
export function deriveInterfaceAccentTheme(
  palette: PaletteColours | null | undefined,
  surfaces: InterfaceSurfaces = INTERFACE_SURFACES,
  fallback?: InterfaceAccentTheme,
): InterfaceAccentTheme {
  const safe = sanitise(surfaces);
  const orFallback = fallback ?? defaultAccentTheme(safe);

  const raw = Array.isArray(palette?.colours) ? palette.colours : [];
  const valid = raw
    .map((colour) => validColour(colour))
    .filter((colour): colour is string => colour !== null);

  /*
   * Exact duplicates count once. A palette often repeats a colour to hold it
   * flat across part of the ramp, and scoring it twice would only make ties
   * arbitrary. Stop *positions* are not read at all: where a colour sits in the
   * gradient says nothing about whether it can be read as text, and duplicate
   * positions are ordinary rather than an error.
   */
  const unique = [...new Set(valid)];
  if (unique.length === 0) return orFallback;

  const neutrals = interfaceNeutrals(safe);
  const best = unique
    .map((hex) => ({ hex, colour: hexToOklch(hex), score: score(hexToOklch(hex), safe, neutrals) }))
    .sort((a, b) => {
      // Score, then the more colourful, then hue, then the hex itself: enough
      // orderings that the result never depends on input order.
      if (b.score !== a.score) return b.score - a.score;
      if (b.colour.c !== a.colour.c) return b.colour.c - a.colour.c;
      if (a.colour.h !== b.colour.h) return a.colour.h - b.colour.h;
      return a.hex < b.hex ? -1 : 1;
    })[0];

  return best === undefined ? orFallback : themeFrom(best.hex, safe, true);
}

/**
 * The theme for a palette id, migrations included.
 *
 * `canonicalPaletteId` is what makes an old `dyalog` link theme itself as Ember
 * rather than fall back, and `getPalette` already answers with the default for
 * anything it does not recognise.
 */
export function interfaceAccentThemeForPaletteId(
  id: string,
  surfaces: InterfaceSurfaces = INTERFACE_SURFACES,
  fallback?: InterfaceAccentTheme,
): InterfaceAccentTheme {
  return deriveInterfaceAccentTheme(getPalette(canonicalPaletteId(id)), surfaces, fallback);
}

/** The custom-property names the stylesheets read, and the theme's values for them. */
export function accentCssVariables(theme: InterfaceAccentTheme): Readonly<Record<string, string>> {
  return {
    '--ui-accent-source': theme.source,
    '--ui-accent-solid': theme.solid,
    '--ui-accent-solid-hover': theme.solidHover,
    '--ui-accent-solid-active': theme.solidActive,
    '--ui-accent-on-solid': theme.onSolid,
    '--ui-accent-text': theme.text,
    '--ui-accent-text-on-dark': theme.textOnDark,
    '--ui-accent-border': theme.border,
    '--ui-accent-border-on-dark': theme.borderOnDark,
    '--ui-accent-soft': theme.soft,
    '--ui-accent-soft-on-dark': theme.softOnDark,
    '--ui-accent-focus': theme.focus,
    '--logo-neutral': theme.logoNeutral,
    '--logo-neutral-on-dark': theme.logoNeutralOnDark,
  };
}
