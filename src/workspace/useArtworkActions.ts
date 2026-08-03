/**
 * Share, copy and export, in one place.
 *
 * Both the ordinary workspace toolbar and the Focus-mode overlay offer these
 * actions. Implementing them twice would guarantee they drift — a caption
 * toggle honoured in one and ignored in the other, or a seed included in one
 * share link and not the other. The hook is called once, high up, and the
 * result is handed to whichever toolbar is on screen, so there is a single
 * source of truth for the caption choice as well as the behaviour.
 */

import { useCallback, useState, type MutableRefObject } from 'react';
import { captionLinesFor } from '@/presets/codeMetrics';
import { type ArtworkPreset } from '@/presets/schema';
import { downloadBlob, exportArtworkPng, exportFilename, type ExportSize } from '@/renderer/exportPng';
import { encodeStops, stopsAreUsable } from '@/renderer/customPalette';
import { animatePalette, type AnimationSettings } from '@/renderer/paletteAnimation';
import { paletteFor } from '@/renderer/renderOptions';
import { isRepeating } from '@/renderer/tiling';
import { fromRenderOptions, fromTilingOptions } from '@/sharing/decodeShareState';
import { buildShareUrl, encodeShareState } from '@/sharing/encodeShareState';
import { SHARE_SCHEMA_VERSION, SHARE_URL_WARNING_LENGTH } from '@/sharing/shareState';
import { type EscapeSettings } from './escapeSettings';
import { type WorkspaceState } from './workspaceState';

export const EXPORT_SIZES: readonly ExportSize[] = [512, 1024, 2048, 'original'];

export interface ArtworkActions {
  /** The most recent outcome, for a polite live region. */
  readonly notice: string | null;
  readonly withCaption: boolean;
  readonly setWithCaption: (on: boolean) => void;
  /** The wording that would be written into the image, shown before it is. */
  readonly captionPreview: string;
  readonly copyApl: () => void;
  readonly share: () => void;
  /** Whether Export writes one tile or the composition on screen. */
  readonly exportTiling: boolean;
  readonly setExportTiling: (on: boolean) => void;
  /** Only true when the artwork is actually repeated; otherwise the choice is moot. */
  readonly canExportTiling: boolean;
  readonly exportAt: (size: ExportSize) => void;
  /**
   * The shape of the matrix an export would be drawn from, or null before a run.
   *
   * Shown beside the sizes so that choosing 1024 from a 128-cell result is an
   * informed choice rather than an implied promise that every pixel was
   * calculated. Read from the completed result, never from the editor.
   */
  readonly sourceShape: { readonly rows: number; readonly columns: number } | null;
}

export function useArtworkActions(options: {
  readonly preset: ArtworkPreset;
  readonly state: WorkspaceState;
  readonly seed?: number | undefined;
  readonly animation: AnimationSettings;
  /** Where the animation has got to, read at the moment an export is asked for. */
  readonly animationPhase: MutableRefObject<number>;
  readonly escape?: EscapeSettings | undefined;
}): ArtworkActions {
  const { preset, state, seed, animation, animationPhase, escape } = options;

  const [notice, setNotice] = useState<string | null>(null);
  const [withCaption, setWithCaption] = useState(false);
  const [exportTiling, setExportTiling] = useState(false);

  /*
   * The composition choice only means something while something is repeated.
   * Offering it against a single copy would be two buttons that do the same
   * thing, which reads as a fault rather than a choice.
   */
  const canExportTiling = isRepeating(state.renderOptions.tiling);

  const announce = useCallback((message: string) => {
    setNotice(message);
    // Cleared so the same message can be announced again next time.
    setTimeout(() => setNotice(null), 4000);
  }, []);

  const share = useCallback(() => {
    const encoded = encodeShareState({
      v: SHARE_SCHEMA_VERSION,
      preset: preset.id,
      code: state.code,
      params: {},
      palette: state.renderOptions.paletteId,
      // Only when there are colours to send. A link using a named ramp keeps
      // exactly the shape it had before custom palettes existed.
      ...(stopsAreUsable(state.renderOptions.customStops)
        ? { stops: encodeStops(state.renderOptions.customStops) }
        : {}),
      ...(state.renderOptions.colouring === undefined ? {} : { colouring: state.renderOptions.colouring }),
      render: fromRenderOptions(state.renderOptions),
      // Omitted entirely when nothing repeats, so a link to a single copy is
      // exactly as short as it was before repeating existed.
      ...(() => {
        const tiling = fromTilingOptions(state.renderOptions);
        return tiling === undefined ? {} : { tiling };
      })(),
      title: preset.title,
      ...(seed === undefined ? {} : { seed }),
    });

    const url = buildShareUrl(window.location.href, preset.id, encoded);

    if (url.length > SHARE_URL_WARNING_LENGTH) {
      announce(
        `The link is ${url.length} characters, which some apps will not accept. It has still been copied.`,
      );
    }

    void navigator.clipboard
      .writeText(url)
      .then(() => {
        if (url.length <= SHARE_URL_WARNING_LENGTH) announce('Link copied.');
      })
      .catch(() => announce('The link could not be copied. Your browser blocked clipboard access.'));
  }, [preset, state.code, state.renderOptions, seed, announce]);

  const copyApl = useCallback(() => {
    void navigator.clipboard
      .writeText(state.code)
      .then(() => announce('APL copied.'))
      .catch(() => announce('The code could not be copied. Your browser blocked clipboard access.'));
  }, [state.code, announce]);

  const exportAt = useCallback(
    (size: ExportSize) => {
      if (state.result === null) {
        announce('Run the artwork before exporting it.');
        return;
      }

      /*
       * The frame on screen, not the palette as saved. Exporting a moving
       * artwork and getting the unanimated one back would be a small betrayal
       * of what the button appears to do.
       *
       * The phase is read whether or not the animation is running, because
       * *pausing does not rewind*. A paused artwork shows the frame it stopped
       * on, and an earlier version of this exported the base palette instead —
       * so the one moment somebody is most likely to press Export, having
       * paused on a frame they liked, was the one moment it gave them something
       * else. At rest the phase is zero and this is the saved palette exactly.
       */
      const palette = animatePalette(paletteFor(state.renderOptions), animation.mode, animationPhase.current);

      void exportArtworkPng({
        matrix: state.result.matrix,
        stats: state.result.stats,
        mode: preset.renderMode,
        options: state.renderOptions,
        palette,
        ...(escape === undefined ? {} : { escape }),
        // The composition already chosen in the Tiling section, never a second
        // set of controls asking the same question again.
        composition: exportTiling && canExportTiling ? 'tiling' : 'tile',
        size,
        title: preset.title,
        // Off unless asked for. The caption counts the expression that ran, so
        // the claim it makes is checkable.
        ...(withCaption ? { caption: captionLinesFor(preset.title, state.code) } : {}),
      })
        .then((blob) => {
          const tiling = state.renderOptions.tiling;
          downloadBlob(
            blob,
            exportFilename(
              preset.title,
              size,
              exportTiling && canExportTiling && tiling !== undefined ? tiling : undefined,
            ),
          );
          announce(withCaption ? 'Image exported with its caption.' : 'Image exported.');
        })
        .catch((error: unknown) => {
          announce(error instanceof Error ? error.message : 'The image could not be exported.');
        });
    },
    [
      state.result,
      state.renderOptions,
      state.code,
      preset,
      withCaption,
      // Both, or Export writes whatever the choice was the time before.
      exportTiling,
      canExportTiling,
      announce,
      animation,
      animationPhase,
      escape,
    ],
  );

  return {
    exportTiling,
    setExportTiling,
    canExportTiling,
    notice,
    withCaption,
    setWithCaption,
    captionPreview: captionLinesFor(preset.title, state.code)[1] ?? '',
    copyApl,
    share,
    exportAt,
    sourceShape:
      state.result === null ? null : { rows: state.result.matrix.rows, columns: state.result.matrix.columns },
  };
}
