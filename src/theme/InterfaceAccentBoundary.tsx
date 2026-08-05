/**
 * Where the artwork's palette becomes the interface's colours.
 *
 * ## Why this element
 *
 * The fourteen custom properties are set on the application shell: the outermost
 * element `App` renders, which contains the header, the main region and the
 * footer, and which is created once for the life of the page. That matters in
 * three ways.
 *
 * It is above the route. The header is outside `main`, so the wordmark can take
 * its colour from the artwork below it — which would be impossible if the
 * properties were set inside the workspace.
 *
 * It never unmounts. Setting them here cannot remount the artwork, discard a
 * result or reset Focus mode, because this element's lifetime does not depend on
 * the route at all. Custom properties inherit, so the Focus-mode page — a fixed,
 * full-screen descendant — and the native `<dialog>` elements in the top layer
 * are covered without being given anything of their own.
 *
 * It is React's to own. The alternative, writing to `document.documentElement`
 * from an effect, would put the theme outside the render that decided it: two
 * sources of truth for one visual state, and a cleanup path to get wrong on every
 * route change. A `style` prop cannot leave stale colours behind, because there is
 * no separate teardown — the value simply becomes the default theme again.
 *
 * ## Where the palette comes from
 *
 * The workspace remains the only palette state. It publishes the colours it is
 * drawing with, this holds the most recent publication, and nothing here derives
 * or invents a palette of its own. Two rules make that safe:
 *
 * A publication is ignored unless it belongs to the artwork currently on screen,
 * so a palette from the piece somebody has just left can never colour the piece
 * they have just opened.
 *
 * Until the workspace has published anything — it loads lazily, so that is every
 * direct visit to an artwork — the preset's own declared palette is used. It is
 * known from the registry without loading the workspace, which is what keeps a
 * link to a Poolrooms artwork from opening orange and correcting itself.
 */

import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { getPreset } from '@/presets/presets';
import { getPalette } from '@/renderer/palettes';
import { AccentPaletteContext, type AccentSource, type PublishAccentPalette } from './accentContext';
import {
  accentCssVariables,
  defaultAccentTheme,
  deriveInterfaceAccentTheme,
  type InterfaceAccentTheme,
} from './interfaceAccent';

interface Props {
  readonly className?: string | undefined;
  /** The artwork on screen. Null on the gallery, Help, About and not-found. */
  readonly presetId: string | null;
  readonly children: ReactNode;
}

export function InterfaceAccentBoundary({ className, presetId, children }: Props) {
  /*
   * The last palette the workspace published, held here and nowhere else.
   *
   * This is the "previous valid theme" the interface falls back on while a
   * custom palette is being typed into. Keeping it in ordinary component state —
   * rather than caching it inside the derivation — is what allows the derivation
   * to stay a pure function of its arguments.
   */
  const [published, setPublished] = useState<AccentSource | null>(null);
  const publish = useCallback<PublishAccentPalette>((source) => setPublished(source), []);

  /** The preset's declared palette, available before the workspace loads. */
  const routeColours = useMemo(() => {
    if (presetId === null) return null;
    const preset = getPreset(presetId);
    return preset === undefined ? null : getPalette(preset.defaultPaletteId).colours;
  }, [presetId]);

  const colours = presetId !== null && published?.presetId === presetId ? published.colours : routeColours;

  /*
   * One string, so the theme is recomputed exactly when it would differ. The
   * colours are rebuilt from it inside the memo rather than captured, which keeps
   * the dependency honestly complete: hex colours cannot contain a comma, so the
   * round trip loses nothing.
   */
  const signature = colours === null ? '' : colours.join(',');

  const theme: InterfaceAccentTheme = useMemo(
    () =>
      signature === '' ? defaultAccentTheme() : deriveInterfaceAccentTheme({ colours: signature.split(',') }),
    [signature],
  );

  // All fourteen at once: a half-applied theme would show one palette's text
  // against another's fill.
  const style = useMemo(() => accentCssVariables(theme) as CSSProperties, [theme]);

  return (
    <AccentPaletteContext.Provider value={publish}>
      <div className={className} style={style} data-accent={theme.derived ? 'palette' : 'default'}>
        {children}
      </div>
    </AccentPaletteContext.Provider>
  );
}
