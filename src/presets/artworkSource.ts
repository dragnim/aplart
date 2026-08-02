/**
 * Reading an artwork's program out of its `.apl` file.
 *
 * Each artwork's APL lives in `src/presets/apl/<preset-id>.apl`, and that file
 * is the source of truth: it is what the editor shows, what is sent to TryAPL,
 * and what a saved project is compared against. The TypeScript module beside it
 * holds the metadata — parameters, prose, palettes — and imports the program
 * rather than restating it.
 *
 * All this does is reconcile one difference between a text file and a string. A
 * text file conventionally ends in a newline; the program does not have a blank
 * last line, and the editor would show one. So exactly one trailing newline is
 * removed — which also means the program is identical whether or not an editor
 * or a tool has re-added it, and a genuinely blank final line survives as the
 * second newline.
 *
 * Carriage returns are stripped for the same reason. `.gitattributes` checks
 * every text file out as LF, so this should never fire; if a clone somehow
 * bypasses that, the artwork still runs and its character count is still right,
 * rather than every line quietly gaining a character.
 */
export function artworkSource(raw: string): string {
  return raw.replace(/\r\n/gu, '\n').replace(/\n$/u, '');
}
