/**
 * The export menu, with its caption toggle.
 *
 * Shared by the ordinary toolbar and the Focus-mode overlay so the two cannot
 * offer different sizes or forget the caption. Dismissable on Escape and on a
 * press outside, which anything opening over the page has to be.
 */

import { useCallback, useRef, useState } from 'react';
import { useDismissable } from '@/components/useDismissable';
import { EXPORT_SIZES, type ArtworkActions } from './useArtworkActions';
import styles from './ExportMenu.module.css';

interface Props {
  readonly actions: ArtworkActions;
  /** Applied to the trigger, so each toolbar can style its own buttons. */
  readonly triggerClassName: string | undefined;
  readonly label?: string;
}

export function ExportMenu({ actions, triggerClassName, label = 'Export' }: Props) {
  const [open, setOpen] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, group, close);

  return (
    <div className={styles.group} ref={group}>
      <button
        type="button"
        className={triggerClassName}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {label}
      </button>

      {open && (
        <ul className={styles.menu} role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={actions.withCaption}
              className={styles.toggle}
              onClick={() => actions.setWithCaption(!actions.withCaption)}
            >
              <span aria-hidden="true" className={styles.tick}>
                {actions.withCaption ? '✓' : ''}
              </span>
              <span>
                Include caption
                <span className={styles.preview}>{actions.captionPreview}</span>
              </span>
            </button>
          </li>
          {/*
            Offered only while something is repeated. The composition itself was
            chosen in the Tiling section and is not asked about again here.
          */}
          {actions.canExportTiling && (
            <li role="none">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={actions.exportTiling}
                className={styles.toggle}
                onClick={() => actions.setExportTiling(!actions.exportTiling)}
              >
                <span aria-hidden="true" className={styles.tick}>
                  {actions.exportTiling ? '✓' : ''}
                </span>
                <span>
                  {/*
                    Neutral on purpose. "Export the repeat" reads as the Repeat
                    mode, and this control is equally about Mirror repeat — two
                    things the interface goes to some trouble to keep distinct.
                    The filename still names the exact mode.
                  */}
                  Export current tiling
                  <span className={styles.preview}>
                    Off writes one tile, as before. On writes the composition on screen.
                  </span>
                </span>
              </button>
            </li>
          )}

          <li role="separator" className={styles.separator} />

          {/*
            What the image is drawn from, next to the sizes it can be drawn at.
            A 1024-pixel export of a 128-cell result is a legitimate thing to
            want; what would not be legitimate is letting the number imply that
            every one of those pixels was calculated.
          */}
          {actions.sourceShape !== null && (
            <li role="presentation" className={styles.note}>
              Source matrix: {actions.sourceShape.columns} × {actions.sourceShape.rows}
            </li>
          )}

          {EXPORT_SIZES.map((size) => (
            <li key={String(size)} role="none">
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  setOpen(false);
                  actions.exportAt(size);
                }}
              >
                {size === 'original' ? 'Original size' : `${size} × ${size}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
