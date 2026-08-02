/**
 * Keeping parameter controls and the code in step.
 *
 * A control is bound to a top-level assignment such as `size←64`. Moving the
 * slider rewrites that line and nothing else, so the code stays the source of
 * truth and the user can always see what the control did.
 *
 * Two rules matter more than anything else here:
 *
 * 1. Only an anchored, whole-line assignment is ever rewritten. Replacing
 *    every occurrence of `size` would corrupt the expression that uses it.
 * 2. If the user has changed the line into something a control cannot
 *    represent, the control detaches rather than overwriting their work.
 */

import { stripComment } from '@/execution/aplSource';
import { escapeRegExp, type ArtworkParameter } from '@/presets/schema';

export type ParameterValue = number | string | boolean;

export interface AssignmentLocation {
  /** Zero-based line index. */
  readonly line: number;
  /** Everything up to and including the arrow, e.g. `  size←`. */
  readonly prefix: string;
  /** The value as written, with surrounding spaces trimmed. */
  readonly valueText: string;
  /** Whitespace between the value and any comment, so spacing is preserved. */
  readonly trailing: string;
  /** Any trailing comment, kept so rewriting a value does not delete it. */
  readonly comment: string;
}

/**
 * Finds the assignment a control is bound to.
 *
 * Anchored to the start of a line, so `x←⍳size←64` is deliberately not a
 * match: rewriting it would change an expression, not a control.
 */
export function findAssignment(code: string, variable: string): AssignmentLocation | null {
  const pattern = new RegExp(`^([ \\t]*${escapeRegExp(variable)}[ \\t]*←[ \\t]*)(.*)$`, 'u');
  const lines = code.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;
    const codePart = stripComment(line);
    const comment = line.slice(codePart.length);

    const match = pattern.exec(codePart);
    if (match !== null) {
      const raw = match[2] as string;
      const withoutTrailing = raw.trimEnd();
      return {
        line: index,
        prefix: match[1] as string,
        valueText: withoutTrailing.trim(),
        trailing: raw.slice(withoutTrailing.length),
        comment,
      };
    }
  }

  return null;
}

/** Formats a value as an APL literal. */
export function formatAplLiteral(value: ParameterValue): string {
  if (typeof value === 'boolean') return value ? '1' : '0';

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`cannot write ${String(value)} as an APL literal`);
    // APL writes negatives with a high bar, not a minus sign.
    return value < 0 ? `¯${String(Math.abs(value))}` : String(value);
  }

  // A character literal; an embedded quote is doubled.
  return `'${value.replaceAll("'", "''")}'`;
}

/** Reads an APL literal back into a value, or null if it is not a plain literal. */
export function parseAplLiteral(text: string): ParameterValue | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  if (/^[¯-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][¯+-]?\d+)?$/u.test(trimmed)) {
    const value = Number(trimmed.replaceAll('¯', '-'));
    return Number.isFinite(value) ? value : null;
  }

  if (/^'(?:[^']|'')*'$/u.test(trimmed)) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }

  return null;
}

/**
 * The plain number a variable is assigned, or null if it is not one.
 *
 * Deliberately simpler than `bindingStateFor`, which also judges whether a
 * control could show the value. A caller that only wants to know what the code
 * says — to quote a limit back, or to read a viewport — has no use for that
 * judgement and should not have to unpack a discriminated union to get past it.
 */
export function numberAssignedTo(code: string, variable: string): number | null {
  const location = findAssignment(code, variable);
  if (location === null) return null;

  const literal = parseAplLiteral(location.valueText);
  return typeof literal === 'number' ? literal : null;
}

export type BindingState =
  | { readonly status: 'bound'; readonly value: ParameterValue; readonly location: AssignmentLocation }
  /** The line is there but holds an expression a control cannot represent. */
  | { readonly status: 'unrepresentable'; readonly location: AssignmentLocation }
  /** The assignment has gone entirely. */
  | { readonly status: 'detached' };

/**
 * Works out whether a control still reflects the code.
 *
 * A control that has lost its line, or whose line now holds an expression such
 * as `size←2×32`, is reported rather than forced back into agreement. The user
 * gets a "Restore control line" action instead of having their edit undone.
 */
export function bindingStateFor(code: string, parameter: ArtworkParameter): BindingState {
  const location = findAssignment(code, parameter.variable);
  if (location === null) return { status: 'detached' };

  const literal = parseAplLiteral(location.valueText);
  if (literal === null) return { status: 'unrepresentable', location };

  if (parameter.type === 'boolean') {
    if (literal !== 0 && literal !== 1) return { status: 'unrepresentable', location };
    return { status: 'bound', value: literal === 1, location };
  }

  if (parameter.type === 'select') {
    const options = parameter.options ?? [];
    if (!options.some((option) => option.value === literal)) {
      return { status: 'unrepresentable', location };
    }
    return { status: 'bound', value: literal, location };
  }

  if (typeof literal !== 'number') return { status: 'unrepresentable', location };
  if (parameter.type === 'integer' && !Number.isInteger(literal)) {
    return { status: 'unrepresentable', location };
  }

  // A value outside the declared range cannot be shown by a slider, which
  // would clamp it and then quietly write the clamped value back over code the
  // user — or whoever shared the link — deliberately wrote.
  if (
    (parameter.min !== undefined && literal < parameter.min) ||
    (parameter.max !== undefined && literal > parameter.max)
  ) {
    return { status: 'unrepresentable', location };
  }

  return { status: 'bound', value: literal, location };
}

export type SetValueResult =
  { readonly ok: true; readonly code: string } | { readonly ok: false; readonly reason: 'detached' };

/**
 * Rewrites the value on a control's assignment line.
 *
 * Only that line changes, and only the part of it before any comment, so
 * `size←64 ⍝ how big` keeps its note.
 */
export function setParameterValue(code: string, variable: string, value: ParameterValue): SetValueResult {
  const location = findAssignment(code, variable);
  if (location === null) return { ok: false, reason: 'detached' };

  const lines = code.split('\n');
  lines[location.line] =
    `${location.prefix}${formatAplLiteral(value)}${location.trailing}${location.comment}`;

  return { ok: true, code: lines.join('\n') };
}

/**
 * Puts a missing assignment back.
 *
 * It is inserted above the first statement rather than appended, because a
 * control has to be assigned before the expression that uses it runs.
 */
export function restoreControlLine(code: string, variable: string, value: ParameterValue): string {
  const existing = findAssignment(code, variable);
  if (existing !== null) {
    const result = setParameterValue(code, variable, value);
    return result.ok ? result.code : code;
  }

  const lines = code.split('\n');
  const assignment = `${variable}←${formatAplLiteral(value)}`;

  // Slot it in with the other controls if there are any, so the top of the
  // file keeps reading as a block of settings.
  let insertAt = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const codePart = stripComment(lines[index] as string).trim();
    if (codePart === '') continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*[ \t]*←/u.test(codePart)) {
      insertAt = index + 1;
    } else {
      break;
    }
  }

  lines.splice(insertAt, 0, assignment);
  return lines.join('\n');
}

/** Applies several parameter values in one pass, for Randomise and Reset. */
export function setParameterValues(code: string, values: ReadonlyMap<string, ParameterValue>): string {
  let updated = code;
  for (const [variable, value] of values) {
    const result = setParameterValue(updated, variable, value);
    if (result.ok) updated = result.code;
  }
  return updated;
}
