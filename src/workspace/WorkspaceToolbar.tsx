/**
 * The workspace header: where you came from, what this is, and what you can
 * do with it.
 */

import { useCallback, useState } from 'react';
import { fromRenderOptions } from '@/sharing/decodeShareState';
import { buildShareUrl, encodeShareState } from '@/sharing/encodeShareState';
import { SHARE_SCHEMA_VERSION, SHARE_URL_WARNING_LENGTH } from '@/sharing/shareState';
import { type ArtworkPreset } from '@/presets/schema';
import { downloadBlob, exportArtworkPng, exportFilename, type ExportSize } from '@/renderer/exportPng';
import { type WorkspaceState } from './workspaceState';
import styles from './WorkspaceToolbar.module.css';

interface Props {
  readonly preset: ArtworkPreset;
  readonly state: WorkspaceState;
  /** Set once Randomise has run, so a shared link reproduces the same values. */
  readonly seed?: number | undefined;
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly onResetArtwork: () => void;
}

const EXPORT_SIZES: readonly ExportSize[] = [512, 1024, 2048, 'original'];

export function WorkspaceToolbar({ preset, state, seed, onResetArtwork }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const announce = useCallback((message: string) => {
    setNotice(message);
    // Cleared so the same message can be announced again next time.
    setTimeout(() => setNotice(null), 4000);
  }, []);

  const handleShare = useCallback(async () => {
    const encoded = encodeShareState({
      v: SHARE_SCHEMA_VERSION,
      preset: preset.id,
      code: state.code,
      params: {},
      palette: state.renderOptions.paletteId,
      render: fromRenderOptions(state.renderOptions),
      title: preset.title,
      ...(seed === undefined ? {} : { seed }),
    });

    const url = buildShareUrl(window.location.href, preset.id, encoded);

    if (url.length > SHARE_URL_WARNING_LENGTH) {
      announce(
        `The link is ${url.length} characters, which some apps will not accept. It has still been copied.`,
      );
    }

    try {
      await navigator.clipboard.writeText(url);
      if (url.length <= SHARE_URL_WARNING_LENGTH) announce('Link copied.');
    } catch {
      announce('The link could not be copied. Your browser blocked clipboard access.');
    }
  }, [preset, state.code, state.renderOptions, seed, announce]);

  const handleCopyApl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(state.code);
      announce('APL copied.');
    } catch {
      announce('The code could not be copied. Your browser blocked clipboard access.');
    }
  }, [state.code, announce]);

  const handleExport = useCallback(
    async (size: ExportSize) => {
      setExportOpen(false);
      if (state.matrix === null || state.stats === null) {
        announce('Run the artwork before exporting it.');
        return;
      }

      try {
        const blob = await exportArtworkPng({
          matrix: state.matrix,
          stats: state.stats,
          mode: preset.renderMode,
          options: state.renderOptions,
          size,
          title: preset.title,
        });
        downloadBlob(blob, exportFilename(preset.title, size));
        announce('Image exported.');
      } catch (error) {
        announce(error instanceof Error ? error.message : 'The image could not be exported.');
      }
    },
    [state.matrix, state.stats, state.renderOptions, preset, announce],
  );

  return (
    <div className={styles.toolbar}>
      <div className={styles.identity}>
        <a className={styles.back} href="#/">
          <span aria-hidden="true">←</span> Gallery
        </a>
        <div>
          <h1 className={styles.title}>{preset.title}</h1>
          <p className={styles.meta}>
            <span className={styles.category}>{preset.category}</span>
            <span className={styles.saveState}>{state.modified ? 'Edited' : 'Original'}</span>
          </p>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={() => void handleCopyApl()}>
          Copy APL
        </button>
        <button type="button" className={styles.action} onClick={() => void handleShare()}>
          Share
        </button>

        <div className={styles.exportGroup}>
          <button
            type="button"
            className={styles.action}
            aria-expanded={exportOpen}
            aria-haspopup="menu"
            onClick={() => setExportOpen((open) => !open)}
          >
            Export
          </button>
          {exportOpen && (
            <ul className={styles.menu} role="menu">
              {EXPORT_SIZES.map((size) => (
                <li key={String(size)} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => void handleExport(size)}
                  >
                    {size === 'original' ? 'Original size' : `${size} × ${size}`}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button type="button" className={styles.action} onClick={onResetArtwork} disabled={!state.modified}>
          Reset
        </button>
      </div>

      <p className={styles.notice} role="status" aria-live="polite">
        {notice}
      </p>
    </div>
  );
}
