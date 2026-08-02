/**
 * Unpacking a creation from a URL.
 *
 * Everything here treats the input as hostile. A share link is arbitrary text
 * from a stranger, so it is size-limited before decompression, validated field
 * by field afterwards, and never trusted to be the shape it claims.
 */

import { inflateSync } from 'fflate';
import { config } from '@/app/config';
import { isRotation, type RenderOptions } from '@/renderer/renderOptions';
import { CUSTOM_PALETTE_ID, decodeStops } from '@/renderer/customPalette';
import { DEFAULT_PALETTE_ID, canonicalPaletteId, paletteExists } from '@/renderer/palettes';
import { fromBase64Url } from './encodeShareState';
import { migrateShareState } from './migrations';
import { MAX_DECODED_SHARE_BYTES, SHARE_SCHEMA_VERSION, type SharedArtworkState } from './shareState';

export type DecodeResult =
  { readonly ok: true; readonly state: SharedArtworkState } | { readonly ok: false; readonly reason: string };

export function decodeShareState(encoded: string): DecodeResult {
  if (encoded.trim() === '') return { ok: false, reason: 'the link carried no artwork' };

  let json: string;
  try {
    const bytes = fromBase64Url(encoded);

    // Checked before inflating and again after: a small compressed payload can
    // expand enormously, and refusing early is cheaper than finding out later.
    if (bytes.length > MAX_DECODED_SHARE_BYTES) {
      return { ok: false, reason: 'the link is too large to open safely' };
    }

    const inflated = inflateSync(bytes);
    if (inflated.length > MAX_DECODED_SHARE_BYTES) {
      return { ok: false, reason: 'the link is too large to open safely' };
    }

    json = new TextDecoder().decode(inflated);
  } catch {
    return { ok: false, reason: 'the link is damaged or incomplete' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'the link is damaged or incomplete' };
  }

  return validateShareState(parsed);
}

export function validateShareState(parsed: unknown): DecodeResult {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'the link does not contain an artwork' };
  }

  const candidate = parsed as Record<string, unknown>;

  const version = typeof candidate.v === 'number' ? candidate.v : 0;
  if (version > SHARE_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'this link was made with a newer version of APL Art than this one',
    };
  }

  const migrated = migrateShareState(candidate, version);
  if (!migrated.ok) return migrated;

  const source = migrated.state;

  const preset = source.preset;
  if (typeof preset !== 'string' || preset === '' || preset.length > 64) {
    return { ok: false, reason: 'the link names no artwork to start from' };
  }

  const code = source.code;
  if (typeof code !== 'string') {
    return { ok: false, reason: 'the link contains no code' };
  }
  if ([...code].length > config.maxCodeLength) {
    return { ok: false, reason: 'the code in this link is longer than the limit' };
  }

  // Canonicalised, not just checked: a link written before a palette was
  // renamed still names the old id and must resolve to the new one rather than
  // silently falling back to the default.
  const palette =
    typeof source.palette === 'string' &&
    (source.palette === CUSTOM_PALETTE_ID || paletteExists(source.palette))
      ? canonicalPaletteId(source.palette)
      : DEFAULT_PALETTE_ID;

  const params =
    typeof source.params === 'object' && source.params !== null && !Array.isArray(source.params)
      ? (source.params as Record<string, unknown>)
      : {};

  // A title is displayed, so it is length-limited and stripped of control
  // characters. React escapes it on render; this stops it being absurd.
  const title =
    typeof source.title === 'string' ? source.title.replace(/[\p{Cc}\p{Cf}]/gu, '').slice(0, 120) : undefined;

  return {
    ok: true,
    state: {
      v: SHARE_SCHEMA_VERSION,
      preset,
      code,
      params,
      palette,
      ...(decodeStops(source.stops) === null ? {} : { stops: source.stops as string }),
      render: normaliseRender(source.render),
      ...(typeof source.seed === 'number' && Number.isFinite(source.seed) ? { seed: source.seed } : {}),
      ...(title === undefined || title === '' ? {} : { title }),
    },
  };
}

function normaliseRender(value: unknown) {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

  return {
    invert: source.invert === true,
    rotation: isRotation(source.rotation) ? source.rotation : (0 as const),
    mirrorH: source.mirrorH === true,
    mirrorV: source.mirrorV === true,
    smooth: source.smooth === true,
  };
}

/** Turns a validated shared state into the renderer's options. */
export function toRenderOptions(state: SharedArtworkState): RenderOptions {
  /*
   * Absent from every link written before custom palettes, and from every link
   * that uses a named ramp. Unreadable stops become no stops, and `paletteFor`
   * then draws the named ramp — a link should open even when part of it cannot
   * be understood.
   */
  const stops = decodeStops(state.stops);

  return {
    paletteId: state.palette,
    ...(stops === null ? {} : { customStops: stops }),
    invert: state.render.invert,
    rotation: state.render.rotation,
    mirrorHorizontally: state.render.mirrorH,
    mirrorVertically: state.render.mirrorV,
    smoothScaling: state.render.smooth,
  };
}

/** Turns the renderer's options into the shared form. */
export function fromRenderOptions(options: RenderOptions) {
  return {
    invert: options.invert,
    rotation: options.rotation,
    mirrorH: options.mirrorHorizontally,
    mirrorV: options.mirrorVertically,
    smooth: options.smoothScaling,
  };
}
