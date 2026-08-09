/**
 * The workspace header: where you came from, what this is, and what you can
 * do with it.
 *
 * The share, copy and export behaviour is not implemented here. It arrives as
 * `actions`, shared with the Focus-mode overlay, so the two cannot drift apart
 * or disagree about whether a caption was requested.
 */

import { useCallback, useRef, useState } from 'react';
import { useMediaQuery } from '@/app/useMediaQuery';
import { useDismissable } from '@/components/useDismissable';
import { type ArtworkPreset } from '@/presets/schema';
import { ExportMenu } from './ExportMenu';
import { EXPORT_SIZES, type ArtworkActions } from './useArtworkActions';
import styles from './WorkspaceToolbar.module.css';

interface Props {
  readonly preset: ArtworkPreset;
  readonly actions: ArtworkActions;
  readonly onEnterFocus: () => void;
  /** Focus returns here when Focus mode is left. */
  readonly focusButtonRef?: React.Ref<HTMLButtonElement>;
}

/*
 * Three actions, and what they have in common is the artwork as a finished
 * thing: how to see it, how to send it, how to take it away. Editing it happens
 * beside it, in the panel of modes and the row of actions beneath them.
 *
 * Copy APL went to the Code tab, where the code it copies is. Reset went to the
 * session actions, where Undo is — it is an editing decision, and it is now one
 * that can be taken back.
 */
export function WorkspaceToolbar({ preset, actions, onEnterFocus, focusButtonRef }: Props) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsGroup = useRef<HTMLDivElement>(null);
  const closeActions = useCallback(() => setActionsOpen(false), []);
  useDismissable(actionsOpen, actionsGroup, closeActions);

  // Enough width for the controls to sit on one line beside the title.
  const roomForRow = useMediaQuery('(min-width: 48rem)');

  return (
    <div className={styles.toolbar}>
      {/*
        The title, and nothing under it.

        This used to be a band of its own: a back link, the title, and a line
        reading "Pattern · Original" beneath. The back link went because the
        wordmark to its left is the way home and the menu to its right holds the
        Gallery. The category went because the gallery card it came from already
        says it, and repeating it bought a whole row.

        Edited and Original did not go — that one means something, and it now sits
        with Undo and Reset in the controls, where what it describes can be acted
        on.
      */}
      <h1 className={styles.title}>{preset.title}</h1>

      {/*
        Focus mode stays out of the overflow menu at every width. It is the one
        action here that changes how the artwork is seen rather than what is
        done with it, and burying it would defeat the point.
      */}
      {roomForRow ? (
        <div className={styles.actions}>
          <button type="button" className={styles.action} ref={focusButtonRef} onClick={onEnterFocus}>
            Focus mode
          </button>
          <button type="button" className={styles.action} onClick={actions.share}>
            Share
          </button>
          <ExportMenu actions={actions} triggerClassName={styles.action} />
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.action} ref={focusButtonRef} onClick={onEnterFocus}>
            Focus mode
          </button>

          <div className={styles.menuGroup} ref={actionsGroup}>
            <button
              type="button"
              className={styles.action}
              aria-expanded={actionsOpen}
              aria-haspopup="menu"
              onClick={() => setActionsOpen((open) => !open)}
            >
              Actions
            </button>
            {actionsOpen && (
              <ul className={styles.menu} role="menu">
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => {
                      setActionsOpen(false);
                      actions.share();
                    }}
                  >
                    Share
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={actions.withCaption}
                    className={styles.menuToggle}
                    onClick={() => actions.setWithCaption(!actions.withCaption)}
                  >
                    <span aria-hidden="true" className={styles.tick}>
                      {actions.withCaption ? '✓' : ''}
                    </span>
                    <span>
                      Include caption
                      <span className={styles.captionPreview}>{actions.captionPreview}</span>
                    </span>
                  </button>
                </li>
                {EXPORT_SIZES.map((size) => (
                  <li key={String(size)} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={() => {
                        setActionsOpen(false);
                        actions.exportAt(size);
                      }}
                    >
                      {size === 'original' ? 'Export at original size' : `Export ${size} × ${size}`}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
