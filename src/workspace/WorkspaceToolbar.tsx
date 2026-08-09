/**
 * What you can do with the artwork, in the app bar.
 *
 * Only that. This was the workspace's own header — a back link, the artwork's
 * title, its category, and these three actions — and then briefly the title and
 * the actions inside the app bar. The title has gone back to the workspace,
 * immediately above the picture it names, because that is where it belongs: the
 * wordmark is the site, the title is the artwork, and these are what you can do
 * to it. Putting the title up here made the bar say two things at once and left
 * it stranded from the artwork on a wide screen.
 *
 * The share, copy and export behaviour is not implemented here. It arrives as
 * `actions`, shared with the Focus-mode overlay, so the two cannot drift apart
 * or disagree about whether a caption was requested.
 */

import { useCallback, useRef, useState } from 'react';
import { useMediaQuery } from '@/app/useMediaQuery';
import { useDismissable } from '@/components/useDismissable';
import { ExportMenu } from './ExportMenu';
import { EXPORT_SIZES, type ArtworkActions } from './useArtworkActions';
import styles from './WorkspaceToolbar.module.css';

interface Props {
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
export function WorkspaceToolbar({ actions, onEnterFocus, focusButtonRef }: Props) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsGroup = useRef<HTMLDivElement>(null);
  const closeActions = useCallback(() => setActionsOpen(false), []);
  useDismissable(actionsOpen, actionsGroup, closeActions);

  // Enough width for the controls to sit on one line beside the title.
  const roomForRow = useMediaQuery('(min-width: 48rem)');

  /*
   * And enough for Focus to keep a button of its own.
   *
   * Below this the bar cannot hold a wordmark, two controls and a menu on one
   * row, and it used to answer by growing to two — 113px of chrome on a phone,
   * which is the opposite of what this bar is for. So Focus folds into the
   * overflow beside the rest, leaving a wordmark, one control and the site menu.
   */
  const roomForFocusButton = useMediaQuery('(min-width: 36rem)');

  return (
    <div className={styles.toolbar}>
      {/*
        Three widths, one row at every one of them.

        Wide: all three actions visible. Middle: Focus keeps its button and the
        rest fold into Actions. Phone: Focus folds in too, leaving a wordmark, one
        overflow and the site menu — which is the only arrangement that fits 390px
        without a second row, and a second row is what this bar exists to remove.
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
          {/*
            Focus keeps its own button while there is room for one, because it is
            the action that changes how the artwork is seen rather than what is
            done with it. On a phone there is no room, and one control that opens
            everything beats two that between them fill the bar.
          */}
          {roomForFocusButton && (
            <button type="button" className={styles.action} ref={focusButtonRef} onClick={onEnterFocus}>
              Focus mode
            </button>
          )}

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
                {/* Where Focus goes once its own button has had to give way. */}
                {!roomForFocusButton && (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      ref={focusButtonRef}
                      onClick={() => {
                        setActionsOpen(false);
                        onEnterFocus();
                      }}
                    >
                      Focus mode
                    </button>
                  </li>
                )}
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
