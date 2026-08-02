/**
 * Bringing forward code written against an older version of a preset.
 *
 * When a preset renames one of its own variables, code already saved in a
 * browser or already sent in a link still uses the old name. That code is
 * self-consistent and runs correctly — it declares and uses `density`
 * throughout — but the preset's controls now look for `classes`, so the slider
 * would report itself detached and offer to put a line back that is already
 * there under another name.
 *
 * So the name is brought forward. This is the one place anything rewrites
 * somebody's code without being asked, which is why it is deliberately narrow:
 * a rename is only applied for the preset that declared it, only to whole
 * identifiers, only where the identifier is executable rather than prose or
 * character data, and only when the new name is not already present — if it is,
 * the code has moved on and is left alone.
 */

import { stripComment } from '@/execution/aplSource';

/**
 * Whole lines a preset has replaced, per preset. Append; never reorder.
 *
 * A heavier hammer than a rename and used for one thing only: a line that was
 * wrong. Matched exactly, so somebody who edited that line keeps what they
 * wrote — their code is theirs, and only an untouched copy of ours is ours to
 * correct.
 */
const REPLACEMENTS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  /*
   * Escape was re-tested every step rather than recorded, so a clamped orbit
   * that fell back inside the escape radius resumed counting. Unreachable with
   * the sliders and reachable by typing, which is not a distinction the count
   * should rest on.
   */
  'mandelbrot-field': [
    [
      'step←{(zr zi n)←⍵ ⋄ m←4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)(n+m)}',
      'step←{(zr zi a n)←⍵ ⋄ a←a∧4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)a(n+a)}',
    ],
    ['⊃⌽step⍣iterations⊢(cr×0)(ci×0)(cr×0)', '⊃⌽step⍣iterations⊢(cr×0)(ci×0)((size,size)⍴1)(cr×0)'],
  ],
};

/** Old name to new name, per preset. Append; never reorder or remove. */
const RENAMES: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  // "density" never described a count of tile shapes; it described nothing.
  'truchet-grid': [['density', 'classes']],
};

const QUOTE = "'";

/**
 * APL identifiers are letters, digits and underscores, so a rename must not
 * match inside a longer name. `⎕` and `⍺⍵` cannot begin one of ours and are not
 * worth guarding against here.
 */
function wholeIdentifier(name: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, 'gu');
}

/**
 * Splits a line into the parts that are executable and the parts that are not.
 *
 * A comment and a character literal both contain text that looks like code and
 * is not, and a rename that reached into either would be editing someone's
 * prose or changing a string their artwork prints. `stripComment` already knows
 * where a comment starts without being fooled by a `⍝` inside quotes; the
 * quoted spans are walked here.
 */
function segments(line: string): { readonly text: string; readonly executable: boolean }[] {
  const code = stripComment(line);
  const comment = line.slice(code.length);

  const parts: { text: string; executable: boolean }[] = [];
  let index = 0;

  while (index < code.length) {
    const opening = code.indexOf(QUOTE, index);
    if (opening === -1) {
      parts.push({ text: code.slice(index), executable: true });
      break;
    }

    parts.push({ text: code.slice(index, opening), executable: true });

    // Find the end of the literal, stepping over doubled quotes.
    let end = opening + 1;
    while (end < code.length) {
      if (code[end] === QUOTE) {
        if (code[end + 1] === QUOTE) {
          end += 2;
          continue;
        }
        end += 1;
        break;
      }
      end += 1;
    }

    parts.push({ text: code.slice(opening, end), executable: false });
    index = end;
  }

  if (comment !== '') parts.push({ text: comment, executable: false });
  return parts;
}

function mapCode(code: string, transform: (executableText: string) => string): string {
  return code
    .split('\n')
    .map((line) =>
      segments(line)
        .map((part) => (part.executable ? transform(part.text) : part.text))
        .join(''),
    )
    .join('\n');
}

/** Whether the code actually uses a name, as opposed to mentioning it. */
function usesIdentifier(code: string, name: string): boolean {
  let found = false;
  mapCode(code, (text) => {
    if (wholeIdentifier(name).test(text)) found = true;
    return text;
  });
  return found;
}

export function migratePresetCode(presetId: string, code: string): string {
  let migrated = replaceLines(presetId, code);

  const renames = RENAMES[presetId];
  if (renames === undefined) return migrated;

  for (const [from, to] of renames) {
    // Already using the new name: nothing to bring forward, and rewriting could
    // only collide with something the author put there themselves.
    if (usesIdentifier(migrated, to)) continue;
    migrated = mapCode(migrated, (text) => text.replace(wholeIdentifier(from), to));
  }
  return migrated;
}

/**
 * Swaps whole lines a preset has since corrected.
 *
 * Line by line and exact, including leading and trailing space. A partial match
 * would rewrite half of somebody's edit into something that no longer runs, and
 * the point of being narrow is that the failure mode is doing nothing.
 */
function replaceLines(presetId: string, code: string): string {
  const replacements = REPLACEMENTS[presetId];
  if (replacements === undefined) return code;

  return code
    .split('\n')
    .map((line) => replacements.find(([from]) => from === line.trim())?.[1] ?? line)
    .join('\n');
}
