/**
 * Reading an artwork's program out of its `.apl` file.
 *
 * Each artwork's APL lives in `src/presets/apl/<preset-id>.apl`, and that file
 * is the source of truth: it is what the editor shows, what is sent to TryAPL,
 * and what a saved project is compared against. The TypeScript module beside it
 * holds the metadata — parameters, prose, palettes — and imports the program
 * rather than restating it.
 *
 * The contract, exactly:
 *
 *   CRLF and lone CR line endings are normalised to LF; at most one terminal LF
 *   is removed; all other whitespace is preserved.
 *
 * Each clause earns its place. The terminal newline is the one difference
 * between a text file and a program: a file conventionally ends in one, and the
 * editor would show it as a blank last line. Removing exactly one means the
 * program is the same whether or not an editor re-added it, while a genuinely
 * blank final line survives as the second newline.
 *
 * Line endings are normalised because `.gitattributes` checks every text file
 * out as LF, so this should never fire — and if a clone bypasses it, the
 * artwork should still run with the character count the gallery advertises,
 * rather than every line quietly gaining a character. A lone CR becomes a
 * newline rather than disappearing: deleting it would honour the letter of the
 * rule by joining two lines of APL into one, which is worse than the corruption
 * being repaired.
 *
 * And nothing else happens. No trimming, no dedenting, no collapsing runs of
 * spaces. Whitespace in APL is not decoration, and a program quietly tidied
 * here would no longer match the copy in somebody's saved project.
 */
export function artworkSource(raw: string): string {
  return raw.replace(/\r\n?/gu, '\n').replace(/\n$/u, '');
}
