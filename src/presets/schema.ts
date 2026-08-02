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
  /**
   * How the slider's travel maps to the value.
   *
   * `logarithmic` makes every step the same proportion instead of the same
   * amount, for a control whose useful range spans orders of magnitude. `step`
   * is then ignored. Requires a positive minimum.
   */
  readonly scale?: 'linear' | 'logarithmic';
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

/**
 * Declares that a preset's matrix is a patch of a plane, so a region of the
 * artwork can be selected and turned back into code.
 *
 * A preset that sets this is promising that its axes are laid out as
 *
 *     axis ← centre + span × ¯1+2×(¯1+⍳size)÷size-1
 *
 * with the named columns variable running across the matrix and the rows
 * variable running down it — the first column at `centre-span` and the last at
 * `centre+span`. Nothing verifies that promise, so the declaration is as much a
 * statement of intent as a configuration: a preset whose axes are built
 * differently must not set it.
 */
export interface PlaneExploration {
  readonly centreXVariable: string;
  readonly centreYVariable: string;
  /** Half the width of the view. Named "span" because smaller means further in. */
  readonly spanVariable: string;
}

/**
 * What a preset can add to the value inspector.
 *
 * The inspector is generic: it reports a number, where it sits in the range, and
 * how many cells share it. Only the preset knows that its largest value means
 * "never escaped", so only the preset can say so — and it says it as text with a
 * placeholder rather than as code, because a preset is data.
 *
 * `{ceiling}` is replaced with the value of `ceilingVariable` as the visible APL
 * currently sets it, so the sentence cannot claim a limit the code is not using.
 */
export interface ValueNotes {
  /** The assignment that sets the largest value the calculation can produce. */
  readonly ceilingVariable: string;
  /** Shown for a selected cell holding that value. */
  readonly cellAtCeiling: string;
  /** Shown when every cell in the result holds it, and nothing is selected. */
  readonly viewAtCeiling: string;
}

/**
 * The range of values the calculation can produce, as opposed to the range this
 * particular result happens to contain.
 *
 * Colouring against the declared range is what keeps a value the same colour
 * between views. Normalising each crop against its own contents would repaint
 * the artwork every time somebody moved, and make two views impossible to
 * compare.
 *
 * The maximum is read from an assignment in the visible APL, so changing the
 * iteration count changes the colouring — which is the honest behaviour, since
 * it changes what the numbers mean.
 */
export interface DeclaredValueRange {
  /**
   * The smallest value the calculation can produce.
   *
   * Not assumed to be zero. Mandelbrot Field counts an iteration before testing
   * whether the point has escaped, and the first test is on `z = 0`, so every
   * cell counts at least once and the smallest possible value is one. The
   * committed fixture confirms it: 128 by 128, values 1 to 28, no zero.
   */
  readonly min: number;
  /** The assignment that sets the largest value. */
  readonly maxVariable: string;
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
  /** Set only by presets whose matrix is a patch of a plane. */
  readonly planeExploration?: PlaneExploration;
  /** Set by presets whose largest value means something worth saying. */
  readonly valueNotes?: ValueNotes;
  /** Set by presets whose values come from a known range rather than an open one. */
  readonly valueRange?: DeclaredValueRange;
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
