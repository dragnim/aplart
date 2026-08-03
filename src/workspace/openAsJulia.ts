/**
 * Opening the Julia set for a point chosen on the Mandelbrot set.
 *
 * Two named artworks, wired to each other on purpose. There is no registry of
 * transformations here and there should not be one: the relationship is
 * mathematical and specific — the Mandelbrot set is a map of which c values
 * produce a bounded Julia set, so picking a point on it and asking to see that
 * Julia set is the one handoff the pair actually supports.
 *
 * The coordinate comes from the completed result and nothing else. The editor
 * may have unrun changes in it and the controls may have moved since; both
 * describe what the *next* run will show, and the cell somebody selected belongs
 * to the picture in front of them. Everything here reads `result.source` and the
 * result's own matrix for that reason.
 */

import { setParameterValues } from '@/editor/parameterBinding';
import { juliaSet } from '@/presets/julia-set';
import { mandelbrotField } from '@/presets/mandelbrot-field';
import { type ArtworkPreset } from '@/presets/schema';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { decimalsFor, planeAt, readViewport } from './planeViewport';

/** The one pairing this module knows about. */
export const HANDOFF_FROM = mandelbrotField.id;
export const HANDOFF_TO = juliaSet.id;

/** Bumped if the stored shape ever changes, so an old tab cannot be misread. */
export const HANDOFF_VERSION = 1;
const STORAGE_KEY = 'apl-art:handoff';

export interface JuliaConstant {
  readonly realC: number;
  readonly imagC: number;
}

/**
 * The complex coordinate a selected cell stands for.
 *
 * `cell` is in the matrix's own coordinates — rotation, mirroring and repeated
 * composition are all unwound before a cell is recorded, so there is nothing
 * left to undo here. The dimensions come from the returned matrix rather than
 * from re-reading `size`, because the matrix is what actually arrived.
 *
 * Rounded by the same rule the viewport writer uses, so a handed-over constant
 * reads like something a person would type rather than like a float.
 */
export function constantForCell(
  preset: ArtworkPreset,
  source: string,
  matrix: NumericMatrix,
  cell: { readonly row: number; readonly column: number },
): JuliaConstant | null {
  const spec = preset.planeExploration;
  if (spec === undefined) return null;

  const viewport = readViewport(source, spec);
  if (viewport === null) return null;

  // A single row or column has no interval to divide, so no fraction to take.
  if (matrix.rows < 2 || matrix.columns < 2) return null;
  if (cell.row < 1 || cell.row > matrix.rows) return null;
  if (cell.column < 1 || cell.column > matrix.columns) return null;

  const { x, y } = planeAt(
    viewport,
    (cell.column - 1) / (matrix.columns - 1),
    (cell.row - 1) / (matrix.rows - 1),
  );

  const decimals = decimalsFor(viewport.span);
  return { realC: Number(x.toFixed(decimals)), imagC: Number(y.toFixed(decimals)) };
}

/**
 * Julia's own program with only the constant replaced.
 *
 * From the preset rather than from whatever Julia was last showing: the point of
 * the action is to see *this* c on Julia's own terms, at its own span and
 * resolution. Carrying Mandelbrot's centre and zoom across would describe the
 * plane the constant was picked from, not the plane the set lives on.
 */
export function juliaSourceFor(constant: JuliaConstant): string {
  return setParameterValues(
    juliaSet.code,
    new Map<string, number>([
      ['realC', constant.realC],
      ['imagC', constant.imagC],
    ]),
  );
}

interface HandoffPayload {
  readonly version: number;
  readonly preset: string;
  readonly realC: number;
  readonly imagC: number;
}

/**
 * Stores the handoff for this tab and returns the token to navigate with.
 *
 * The coordinate stays out of the URL. A link is a promise that the thing at the
 * other end is what you meant to send, and this token is an internal detail of
 * one press of a button — so it lives in session storage, where it cannot be
 * pasted into a chat window and cannot make a stranger's browser run something.
 *
 * Kept for the lifetime of the tab rather than consumed on first read, so Reload
 * and Forward reconstruct the same artwork instead of silently falling back.
 */
export function storeHandoff(constant: JuliaConstant): string | null {
  const payload: HandoffPayload = {
    version: HANDOFF_VERSION,
    preset: HANDOFF_TO,
    realC: constant.realC,
    imagC: constant.imagC,
  };

  const token = `${String(Date.now().toString(36))}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    sessionStorage.setItem(`${STORAGE_KEY}:${token}`, JSON.stringify(payload));
  } catch {
    // Storage can be full or blocked outright. Better to do nothing than to
    // navigate to an artwork whose constant was silently lost.
    return null;
  }
  return token;
}

/**
 * Reads a handoff back, or null for anything that is not one.
 *
 * Session storage is editable by hand, so this is untrusted input like a shared
 * link. Everything is checked: the version, that the payload was meant for this
 * artwork, and that both parts of the constant are finite numbers. Anything else
 * is discarded and the artwork opens on its ordinary defaults, which is the only
 * safe way to fail — a half-applied constant would be a Julia set nobody chose.
 */
export function readHandoff(token: string | null, presetId: string): JuliaConstant | null {
  if (token === null || token === '') return null;

  let raw: string | null;
  try {
    raw = sessionStorage.getItem(`${STORAGE_KEY}:${token}`);
  } catch {
    // Reading storage is itself what throws in a blocked context.
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const payload = parsed as Record<string, unknown>;
  if (payload.version !== HANDOFF_VERSION) return null;
  if (payload.preset !== presetId) return null;

  const { realC, imagC } = payload;
  if (typeof realC !== 'number' || !Number.isFinite(realC)) return null;
  if (typeof imagC !== 'number' || !Number.isFinite(imagC)) return null;

  return { realC, imagC };
}
