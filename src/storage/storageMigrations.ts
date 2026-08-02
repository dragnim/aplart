/**
 * Reading projects written by older versions.
 *
 * Anything that cannot be brought forward is discarded rather than guessed at.
 * Losing one saved piece is bad; showing someone a corrupted version of their
 * work, or crashing the gallery on load, is worse.
 */

import { CUSTOM_PALETTE_ID, parseStops } from '@/renderer/customPalette';
import { normaliseColouring } from '@/renderer/escapeColouring';
import { DEFAULT_PALETTE_ID, canonicalPaletteId, paletteExists } from '@/renderer/palettes';
import { defaultRenderOptions, isRotation, type RenderOptions } from '@/renderer/renderOptions';
import { PROJECT_SCHEMA_VERSION, type Project, type StoredMatrix } from './ProjectRepository';

export type MigrationOutcome =
  { readonly ok: true; readonly project: Project } | { readonly ok: false; readonly reason: string };

/**
 * Validates and upgrades one stored record.
 *
 * Treats the input as untrusted: browser storage can be edited by hand, shared
 * between versions, or corrupted by a half-finished write.
 */
export function migrateProject(raw: unknown): MigrationOutcome {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'not an object' };
  }

  const record = raw as Record<string, unknown>;
  const version = typeof record.schemaVersion === 'number' ? record.schemaVersion : 0;

  if (version > PROJECT_SCHEMA_VERSION) {
    return { ok: false, reason: `written by a newer version (${version})` };
  }

  // Version 1 is the first format; there is nothing earlier to upgrade from.
  // Later versions add their transformations here, in order.

  const id = typeof record.id === 'string' ? record.id : null;
  const sourcePresetId = typeof record.sourcePresetId === 'string' ? record.sourcePresetId : null;
  const code = typeof record.code === 'string' ? record.code : null;

  if (id === null || sourcePresetId === null || code === null) {
    return { ok: false, reason: 'missing an id, preset or code' };
  }

  /*
   * A project saved before a palette was renamed keeps working: the id is
   * redirected rather than discarded.
   *
   * `custom` is accepted although it names no shipped ramp — it means the stops
   * stored alongside. Without this it would fail the existence check and be
   * quietly replaced by the default, throwing away colours somebody chose.
   */
  const paletteId =
    typeof record.paletteId === 'string' &&
    (record.paletteId === CUSTOM_PALETTE_ID || paletteExists(record.paletteId))
      ? canonicalPaletteId(record.paletteId)
      : DEFAULT_PALETTE_ID;

  return {
    ok: true,
    project: {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id,
      sourcePresetId,
      title: typeof record.title === 'string' ? record.title.slice(0, 120) : sourcePresetId,
      code,
      parameterValues:
        typeof record.parameterValues === 'object' &&
        record.parameterValues !== null &&
        !Array.isArray(record.parameterValues)
          ? (record.parameterValues as Record<string, unknown>)
          : {},
      paletteId,
      renderOptions: normaliseRenderOptions(record.renderOptions, paletteId),
      createdAt: asIsoDate(record.createdAt),
      updatedAt: asIsoDate(record.updatedAt),
      ...(readMatrix(record.lastSuccessfulMatrix) === null
        ? {}
        : { lastSuccessfulMatrix: readMatrix(record.lastSuccessfulMatrix) as StoredMatrix }),
    },
  };
}

function normaliseRenderOptions(value: unknown, paletteId: string): RenderOptions {
  const fallback = defaultRenderOptions(paletteId);
  if (typeof value !== 'object' || value === null) return fallback;

  const record = value as Record<string, unknown>;

  /*
   * Absent in everything saved before custom palettes existed, which is the
   * common case and needs no special handling: no stops means the named ramp,
   * exactly as before. Unreadable stops are dropped rather than repaired, and
   * `paletteFor` then falls back to the named ramp — a project should still
   * open when its colours cannot be understood.
   */
  const customStops = parseStops(record.customStops);
  const colouring = normaliseColouring(record.colouring);

  return {
    paletteId,
    invert: record.invert === true,
    rotation: isRotation(record.rotation) ? record.rotation : fallback.rotation,
    mirrorHorizontally: record.mirrorHorizontally === true,
    mirrorVertically: record.mirrorVertically === true,
    smoothScaling: record.smoothScaling === true,
    ...(customStops === null ? {} : { customStops }),
    ...(colouring === null ? {} : { colouring }),
  };
}

function asIsoDate(value: unknown): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
  return new Date().toISOString();
}

function readMatrix(value: unknown): StoredMatrix | null {
  if (typeof value !== 'object' || value === null) return null;

  const record = value as Record<string, unknown>;
  const { rows, columns, values } = record;

  if (typeof rows !== 'number' || typeof columns !== 'number' || !Array.isArray(values)) return null;
  if (rows < 1 || columns < 1 || values.length !== rows * columns) return null;
  if (!values.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) return null;

  return { rows, columns, values: values as number[] };
}
