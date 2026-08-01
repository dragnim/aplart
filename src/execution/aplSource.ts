/**
 * Turning preset source into something TryAPL will accept.
 *
 * TryAPL evaluates exactly one expression per request, but presets are written
 * as several commented lines so they can be read and edited. This module
 * flattens them into a single line joined with `⋄`.
 *
 * The flattening has to understand APL string literals. A naive
 * `line.split('⍝')[0]` would truncate `'⍝'` mid-string and produce code that
 * is subtly different from what the user wrote.
 */

/** Statement separator. Diamond, not the similar-looking lozenge. */
const DIAMOND = '⋄';
const COMMENT = '⍝';
const QUOTE = "'";

/**
 * Removes the comment from one line, respecting string literals.
 *
 * In APL a quote inside a string is written doubled, so `'it''s'` is one
 * string containing an apostrophe. Scanning left to right, a quote while
 * inside a string either starts an escaped pair or closes the string.
 */
export function stripComment(line: string): string {
  let inString = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === QUOTE) {
      if (inString && line[index + 1] === QUOTE) {
        index += 1; // An escaped quote; stay inside the string.
        continue;
      }
      inString = !inString;
      continue;
    }

    if (character === COMMENT && !inString) {
      return line.slice(0, index);
    }
  }

  return line;
}

/**
 * True when the line has an unterminated string literal.
 *
 * Such a line would swallow the `⋄` that follows it and change the meaning of
 * everything after, so flattening refuses rather than sending it.
 */
export function hasUnterminatedString(line: string): boolean {
  let inString = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character !== QUOTE) continue;

    if (inString && line[index + 1] === QUOTE) {
      index += 1;
      continue;
    }
    inString = !inString;
  }

  return inString;
}

export type FlattenResult =
  | {
      readonly ok: true;
      /** The statements joined with diamonds, ready to send as-is. */
      readonly expression: string;
      /**
       * The individual statements, in order.
       *
       * The transport wrappers need these separately. Parenthesising the
       * joined form — `r←(size←160 ⋄ 9|∘.×⍨⍳size)` — does not mean what it
       * looks like, and the live service returns a rank-1 result for it. Only
       * the final statement may be wrapped.
       */
      readonly statements: readonly string[];
    }
  | { readonly ok: false; readonly reason: 'empty' | 'unterminatedString'; readonly message: string };

/**
 * Flattens multi-line preset source into the single expression TryAPL wants.
 *
 * Comments are removed, blank lines dropped, and the remaining statements
 * joined with `⋄`. Statements that already end in a diamond are not given a
 * second one.
 *
 * Known limitation: a dfn or tradfn whose body spans several lines cannot be
 * flattened this way, because `⋄` inside braces means something different from
 * a line break in a function body. TryAPL does not support multi-line
 * definitions either, so presets are written as expressions.
 */
export function flattenToExpression(source: string): FlattenResult {
  const statements: string[] = [];

  for (const rawLine of source.split(/\r?\n/u)) {
    if (hasUnterminatedString(rawLine)) {
      return {
        ok: false,
        reason: 'unterminatedString',
        message: 'A line has a quote that is never closed. Check the string literals in your code.',
      };
    }

    const line = stripComment(rawLine).trim();
    if (line === '') continue;

    // Avoid producing `a ⋄ ⋄ b` from source that already separates statements.
    statements.push(line.endsWith(DIAMOND) ? line.slice(0, -1).trimEnd() : line);
  }

  const nonEmpty = statements.filter((statement) => statement !== '');

  if (nonEmpty.length === 0) {
    return {
      ok: false,
      reason: 'empty',
      message: 'There is no code to run.',
    };
  }

  return { ok: true, expression: nonEmpty.join(` ${DIAMOND} `), statements: nonEmpty };
}
