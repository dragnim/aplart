/**
 * The preset model and its runtime validator.
 *
 * Presets are authored as TypeScript, so the compiler catches most mistakes.
 * The validator exists for the cases it cannot catch — a slider whose minimum
 * exceeds its maximum, a default outside its own range, a parameter bound to a
 * variable that never appears in the code — and so that one bad preset is
 * dropped from the gallery instead of taking the whole page down with it.
 */

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * How a matrix becomes a picture.
 *
 * The first four paint one colour per cell. 'tiles' draws a shape per cell
 * instead, so neighbouring cells join into continuous curves — which is what a
 * Truchet tiling actually is.
 */
export type RenderMode = 'indexed' | 'continuous' | 'binary' | 'threshold' | 'tiles';

export type PresetCategory = 'pattern' | 'fractal' | 'geometry' | 'cellular';

export interface PrimitiveReference {
  readonly glyph: string;
  readonly name: string;
  readonly shortDescription: string;
}

export interface ParameterOption {
  readonly label: string;
  readonly value: string | number;
}

export interface ArtworkParameter {
  readonly id: string;
  /** The APL name this control is bound to, e.g. `size` in `size←64`. */
  readonly variable: string;
  readonly label: string;
  readonly description?: string;
  readonly type: 'integer' | 'number' | 'select' | 'boolean';
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly defaultValue: number | string | boolean;
  readonly randomisable: boolean;
  readonly options?: readonly ParameterOption[];
}

export interface PresetOutputLimits {
  readonly maxRows?: number;
  readonly maxColumns?: number;
  readonly maxCells?: number;
  /**
   * Opt in to banded transport.
   *
   * TryAPL truncates a response at 93 lines, so one request cannot return more
   * than about 90 rows. A preset that sets this is fetched as several banded
   * requests and reassembled, which costs one execution per band. Leave it off
   * unless the piece genuinely needs the resolution.
   */
  readonly highResolution?: boolean;
}

export interface ArtworkPreset {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: PresetCategory;
  readonly difficulty: Difficulty;
  readonly code: string;
  readonly parameters: readonly ArtworkParameter[];
  readonly defaultPaletteId: string;
  readonly availablePaletteIds?: readonly string[];
  readonly renderMode: RenderMode;
  readonly outputLimits?: PresetOutputLimits;
  readonly primitives: readonly PrimitiveReference[];
  readonly thumbnailPath: string;
  readonly fixturePath: string;
  readonly featured?: boolean;
  readonly tags: readonly string[];
  /** Preset-specific prompts for the collapsible "Try changing this" panel. */
  readonly tryChangingThis?: readonly string[];
}

export interface PresetValidationIssue {
  readonly presetId: string;
  readonly message: string;
}

/**
 * Returns the problems found in a preset. An empty array means it is usable.
 *
 * Kept as a pure function so both the gallery and `npm run validate:presets`
 * apply exactly the same rules.
 */
export function validatePreset(preset: ArtworkPreset): PresetValidationIssue[] {
  const issues: PresetValidationIssue[] = [];
  const fail = (message: string) => issues.push({ presetId: preset.id, message });

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(preset.id)) {
    fail('id must be lower-case kebab-case, because it appears in URLs and file names');
  }
  if (preset.title.trim() === '') fail('title must not be empty');
  if (preset.description.trim() === '') fail('description must not be empty');
  if (preset.code.trim() === '') fail('code must not be empty');
  if (preset.parameters.length === 0) {
    fail('every preset needs at least one editable parameter');
  }

  const seenIds = new Set<string>();
  for (const parameter of preset.parameters) {
    if (seenIds.has(parameter.id)) fail(`duplicate parameter id "${parameter.id}"`);
    seenIds.add(parameter.id);

    validateParameter(preset, parameter, fail);
  }

  return issues;
}

function validateParameter(
  preset: ArtworkPreset,
  parameter: ArtworkParameter,
  fail: (message: string) => void,
): void {
  const where = `parameter "${parameter.id}"`;

  if (!/^[A-Za-z_⎕][A-Za-z0-9_]*$/.test(parameter.variable)) {
    fail(`${where} is bound to "${parameter.variable}", which is not a valid APL name`);
  }

  // A control that is not bound to a top-level assignment can never move the
  // code, so it would render permanently detached.
  const assignment = new RegExp(`^[ \\t]*${escapeRegExp(parameter.variable)}[ \\t]*←`, 'mu');
  if (!assignment.test(preset.code)) {
    fail(`${where} expects a top-level assignment "${parameter.variable}←…" but the code has none`);
  }

  switch (parameter.type) {
    case 'integer':
    case 'number': {
      const { min, max, defaultValue } = parameter;
      if (typeof defaultValue !== 'number') {
        fail(`${where} is numeric but its default is not a number`);
        break;
      }
      if (min === undefined || max === undefined) {
        fail(`${where} is numeric and must declare both min and max`);
        break;
      }
      if (min >= max) fail(`${where} has min ${min} which is not below max ${max}`);
      if (defaultValue < min || defaultValue > max) {
        fail(`${where} has default ${defaultValue} outside its range ${min}–${max}`);
      }
      if (parameter.type === 'integer' && !Number.isInteger(defaultValue)) {
        fail(`${where} is an integer control but its default is ${defaultValue}`);
      }
      if (parameter.step !== undefined && parameter.step <= 0) {
        fail(`${where} has a step of ${parameter.step}, which must be positive`);
      }
      break;
    }
    case 'select': {
      const options = parameter.options ?? [];
      if (options.length < 2) fail(`${where} is a select and needs at least two options`);
      if (!options.some((option) => option.value === parameter.defaultValue)) {
        fail(`${where} has a default that is not one of its options`);
      }
      break;
    }
    case 'boolean': {
      if (typeof parameter.defaultValue !== 'boolean') {
        fail(`${where} is a toggle but its default is not true or false`);
      }
      break;
    }
  }
}

/** Escapes a string for literal use inside a regular expression. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
