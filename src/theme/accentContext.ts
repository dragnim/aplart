/**
 * How the workspace hands its palette to the application shell.
 *
 * A context rather than a prop, because the two are far apart: the palette lives
 * in the workspace, and the element that carries the interface colours is the
 * shell above the router. Threading it through every route would make the
 * gallery, Help and About all take a palette argument they have no use for.
 *
 * Separate from the component that provides it so that this file exports no
 * components, which keeps fast refresh working for both.
 */

import { createContext, useContext } from 'react';

/**
 * The colours an artwork is drawing with, and which artwork's they are.
 *
 * Plain data rather than a palette object: the payload changes identity only when
 * the derived theme would actually differ, and the shell needs nothing else.
 */
export interface AccentSource {
  readonly presetId: string;
  readonly colours: readonly string[];
}

export type PublishAccentPalette = (source: AccentSource | null) => void;

export const AccentPaletteContext = createContext<PublishAccentPalette>(() => undefined);

/**
 * Publishing colours sets the interface accent. Publishing `null` says no artwork
 * is open, which belongs to the workspace's unmount.
 *
 * Publishing *nothing* — simply not calling this — is how "keep the colours you
 * already have" is expressed, and is what an unusable custom palette does mid-edit.
 */
export function usePublishAccentPalette(): PublishAccentPalette {
  return useContext(AccentPaletteContext);
}
