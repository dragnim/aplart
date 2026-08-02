/**
 * Presentation settings.
 *
 * Everything here is applied in the browser to an already-computed matrix.
 * None of it re-runs the APL — that distinction is surfaced in the interface
 * as "Appearance" separate from "Code controls".
 */

import { type NumericMatrix } from '@/matrix/matrixTypes';
import { CUSTOM_PALETTE_ID, paletteFromStops, stopsAreUsable, type ColourStop } from './customPalette';
import { type Colouring } from './escapeColouring';
import { getPalette, type Palette } from './palettes';
import { DEFAULT_TILING, type TilingView } from './tiling';

export type Rotation = 0 | 90 | 180 | 270;

export interface RenderOptions {
  readonly paletteId: string;
  /**
   * Colours somebody chose, used when `paletteId` is `custom`.
   *
   * Kept even while a named palette is selected, so switching to Custom and
   * back does not throw the work away — choosing a named ramp is how you undo a
   * custom one, and it would be a poor undo if it also deleted it.
   */
  readonly customStops?: readonly ColourStop[];
  /**
   * How escape counts become colours.
   *
   * Only meaningful for a preset that declares a value range; harmless
   * elsewhere, and absent from everything saved before it existed. A
   * presentation choice like the rest of this, so it never re-runs anything.
   */
  readonly colouring?: Colouring;
  readonly invert: boolean;
  readonly rotation: Rotation;
  readonly mirrorHorizontally: boolean;
  readonly mirrorVertically: boolean;
  /** Nearest-neighbour keeps cell edges crisp; smoothing blurs them deliberately. */
  readonly smoothScaling: boolean;
  /**
   * How the finished artwork is repeated across the viewport.
   *
   * Composition, not calculation: the same rendered tile drawn several times.
   * Absent from everything saved before it existed, which reads as one copy.
   */
  readonly tiling?: TilingView;
}

export function defaultRenderOptions(paletteId: string): RenderOptions {
  return {
    paletteId,
    invert: false,
    rotation: 0,
    mirrorHorizontally: false,
    mirrorVertically: false,
    smoothScaling: false,
    tiling: DEFAULT_TILING,
  };
}

/**
 * The palette these options describe.
 *
 * The one place that decides between a named ramp and a custom one, so nothing
 * downstream has to know the difference — the renderer, the export and the
 * thumbnail script all take a `Palette` and are unaware this exists.
 *
 * Falls back to the named ramp when the stops are missing or unusable. A link
 * that says "custom" and carries nothing readable should draw the artwork in
 * some sensible colours, not fail to draw it.
 */
export function paletteFor(options: RenderOptions): Palette {
  if (options.paletteId === CUSTOM_PALETTE_ID && stopsAreUsable(options.customStops)) {
    return paletteFromStops(options.customStops);
  }
  return getPalette(options.paletteId);
}

export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

export function isRotation(value: unknown): value is Rotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

/**
 * Applies mirroring and rotation to the matrix itself.
 *
 * Transforming the data rather than the canvas keeps the exported PNG and the
 * on-screen artwork identical, and means the accessible description reports
 * the dimensions the viewer actually sees.
 *
 * Mirrors are applied before rotation, so the controls compose predictably.
 */
export function transformMatrix(matrix: NumericMatrix, options: RenderOptions): NumericMatrix {
  const mirrored = applyMirrors(matrix, options);
  return applyRotation(mirrored, options.rotation);
}

function applyMirrors(matrix: NumericMatrix, options: RenderOptions): NumericMatrix {
  if (!options.mirrorHorizontally && !options.mirrorVertically) return matrix;

  const { rows, columns, values } = matrix;
  const output = new Float64Array(values.length);

  for (let row = 0; row < rows; row += 1) {
    const sourceRow = options.mirrorVertically ? rows - 1 - row : row;
    for (let column = 0; column < columns; column += 1) {
      const sourceColumn = options.mirrorHorizontally ? columns - 1 - column : column;
      output[row * columns + column] = values[sourceRow * columns + sourceColumn] as number;
    }
  }

  return { rows, columns, values: output };
}

function applyRotation(matrix: NumericMatrix, rotation: Rotation): NumericMatrix {
  if (rotation === 0) return matrix;

  const { rows, columns, values } = matrix;
  const turned = rotation === 90 || rotation === 270;
  const outputRows = turned ? columns : rows;
  const outputColumns = turned ? rows : columns;
  const output = new Float64Array(values.length);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const value = values[row * columns + column] as number;

      let targetRow: number;
      let targetColumn: number;
      switch (rotation) {
        case 90:
          targetRow = column;
          targetColumn = rows - 1 - row;
          break;
        case 180:
          targetRow = rows - 1 - row;
          targetColumn = columns - 1 - column;
          break;
        case 270:
          targetRow = columns - 1 - column;
          targetColumn = row;
          break;
      }

      output[targetRow * outputColumns + targetColumn] = value;
    }
  }

  return { rows: outputRows, columns: outputColumns, values: output };
}
