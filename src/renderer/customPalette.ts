/**
 * A palette somebody made, rather than one that shipped.
 *
 * Deliberately a data model with no user interface in it. The renderer takes a
 * `Palette`, and a custom one turns into exactly that — so an artwork drawn
 * from custom colours works with the editor unmounted, on a page that never
 * loads it, and in the Node scripts that render thumbnails.
 *
 * Positions are percentages because that is what the control shows and what
 * gets written into a link. The ramp wants fractions, so the conversion happens
 * once, here, at the boundary.
 */

import { type Palette } from './palettes';

export interface ColourStop {
  /**
   * Stable for the life of a stop.
   *
   * Not the index: stops are kept in position order, so moving one past another
   * renumbers both, and a control keyed by index would take the focus with it.
   */
  readonly id: string;
  /** `#rrggbb`, lower case. */
  readonly colour: string;
  /** 0 to 100 across the value range. */
  readonly position: number;
}

/** Below two there is no gradient; above twelve the control stops being readable. */
export const MIN_STOPS = 2;
export const MAX_STOPS = 12;

/** The palette id that means "the stops, not one of the named ramps". */
export const CUSTOM_PALETTE_ID = 'custom';

const HEX = /^#[0-9a-f]{6}$/iu;

let counter = 0;

/**
 * Ids are generated rather than derived from the colour or the position.
 *
 * Two stops may hold the same colour at the same place — briefly, while one is
 * being moved past another — and deriving an id from either would make them the
 * same stop for as long as that lasted.
 */
export function newStopId(): string {
  counter += 1;
  return `stop-${String(counter)}`;
}

function clampPosition(position: number): number {
  if (!Number.isFinite(position)) return 0;
  return Math.min(100, Math.max(0, Math.round(position * 100) / 100));
}

/** Expands the three-digit form and lower-cases, or null if it is not a colour. */
export function normaliseColour(value: string): string | null {
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/iu.exec(prefixed);
  if (short !== null) {
    const [, r, g, b] = short;
    return `#${r ?? ''}${r ?? ''}${g ?? ''}${g ?? ''}${b ?? ''}${b ?? ''}`.toLowerCase();
  }

  return HEX.test(prefixed) ? prefixed.toLowerCase() : null;
}

/**
 * Puts a set of stops into the order and range the renderer expects.
 *
 * Sorted by position, stably — so two stops sharing a position keep the order
 * they were given, and the one written later wins for values above it. That is
 * a hard edge in the gradient rather than a fault, and it is the only way to
 * get one.
 */
export function normaliseStops(stops: readonly ColourStop[]): ColourStop[] {
  return stops
    .map((stop, index) => ({ stop, index }))
    .sort((a, b) => {
      const byPosition = clampPosition(a.stop.position) - clampPosition(b.stop.position);
      return byPosition !== 0 ? byPosition : a.index - b.index;
    })
    .map(({ stop }) => ({
      id: stop.id,
      colour: normaliseColour(stop.colour) ?? '#000000',
      position: clampPosition(stop.position),
    }));
}

export function paletteFromStops(stops: readonly ColourStop[]): Palette {
  const ordered = normaliseStops(stops);

  return {
    id: CUSTOM_PALETTE_ID,
    name: 'Custom',
    colours: ordered.map((stop) => stop.colour),
    // Fractions, ascending, one per colour. Absent on a named palette, where
    // the entries are evenly spaced.
    positions: ordered.map((stop) => stop.position / 100),
    background: ordered[0]?.colour ?? '#000000',
  };
}

/** Whether these stops could be drawn with. */
export function stopsAreUsable(stops: readonly ColourStop[] | undefined): stops is readonly ColourStop[] {
  return stops !== undefined && stops.length >= MIN_STOPS && stops.length <= MAX_STOPS;
}

/** Seeds the editor from a ramp that already exists, rather than from nothing. */
export function stopsFromPalette(palette: Palette): ColourStop[] {
  const colours = palette.colours.slice(0, MAX_STOPS);
  const last = Math.max(1, colours.length - 1);

  return colours.map((colour, index) => ({
    id: newStopId(),
    colour: normaliseColour(colour) ?? '#000000',
    position: Math.round((100 * index) / last),
  }));
}

/**
 * Reads stops from something untrusted — a link, or storage edited by hand.
 *
 * Returns null rather than a partial set. A palette missing one stop is not a
 * smaller palette, it is a different one, and drawing it would misrepresent
 * what was shared.
 */
export function parseStops(value: unknown): ColourStop[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length < MIN_STOPS || value.length > MAX_STOPS) return null;

  const stops: ColourStop[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null) return null;

    const record = entry as Record<string, unknown>;
    const colour = typeof record.colour === 'string' ? normaliseColour(record.colour) : null;
    const position = typeof record.position === 'number' ? record.position : Number.NaN;
    if (colour === null || !Number.isFinite(position) || position < 0 || position > 100) return null;

    // The id is not read back. It is local to one editing session, and trusting
    // one from outside would let a link decide which control has focus.
    stops.push({ id: newStopId(), colour, position: clampPosition(position) });
  }

  return normaliseStops(stops);
}

/**
 * The compact form for a link: `0-160f0a_50-ff6a13_100-fff1e4`.
 *
 * Positions are written to two decimals at most and the hash is dropped, which
 * keeps a twelve-stop palette to about a hundred and thirty characters — worth
 * the small format because a share URL has a length people notice.
 *
 * Underscore between stops, not a full stop: positions are fractional, so a
 * full stop appears *inside* one and splitting on it tore `12.5` in half. Both
 * characters are unreserved in a URL; only one of them is unambiguous here.
 */
export function encodeStops(stops: readonly ColourStop[]): string {
  return normaliseStops(stops)
    .map((stop) => `${String(stop.position)}-${stop.colour.slice(1)}`)
    .join('_');
}

export function decodeStops(encoded: unknown): ColourStop[] | null {
  if (typeof encoded !== 'string' || encoded === '') return null;

  const parts = encoded.split('_');
  if (parts.length < MIN_STOPS || parts.length > MAX_STOPS) return null;

  const stops: ColourStop[] = [];
  for (const part of parts) {
    const match = /^(\d+(?:\.\d+)?)-([0-9a-f]{6})$/iu.exec(part);
    if (match === null) return null;

    const position = Number(match[1]);
    if (!Number.isFinite(position) || position > 100) return null;
    stops.push({ id: newStopId(), colour: `#${(match[2] as string).toLowerCase()}`, position });
  }

  return normaliseStops(stops);
}
