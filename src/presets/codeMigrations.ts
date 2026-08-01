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
 * identifiers, and only when the new name is not already present — if it is,
 * the code has moved on and is left alone.
 */

/** Old name to new name, per preset. Append; never reorder or remove. */
const RENAMES: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  // "density" never described a count of tile shapes; it described nothing.
  'truchet-grid': [['density', 'classes']],
};

/**
 * APL identifiers are letters, digits and underscores, so a rename must not
 * match inside a longer name. `⎕` and `⍺⍵` cannot begin one of ours and are not
 * worth guarding against here.
 */
function wholeIdentifier(name: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, 'gu');
}

export function migratePresetCode(presetId: string, code: string): string {
  const renames = RENAMES[presetId];
  if (renames === undefined) return code;

  let migrated = code;
  for (const [from, to] of renames) {
    // Already using the new name: nothing to bring forward, and rewriting could
    // only collide with something the author put there themselves.
    if (wholeIdentifier(to).test(migrated)) continue;
    migrated = migrated.replace(wholeIdentifier(from), to);
  }
  return migrated;
}
