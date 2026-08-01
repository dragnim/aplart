/**
 * The overlay bar in Focus mode.
 *
 * Deliberately thin: the title, what the artwork is doing, and the few actions
 * worth interrupting the artwork for. Everything else lives in the drawer.
 *
 * It fades while nothing is happening, but never while one of its own controls
 * has focus, never while the drawer is open, and never while a run is in
 * flight — a toolbar that vanishes under the pointer, or hides the progress of
 * the thing you just started, is worse than one that is always there.
 */

import { useCallback, useState } from 'react';
import { ExportMenu } from './ExportMenu';
import { type ArtworkActions } from './useArtworkActions';
import { type Fullscreen } from './useFullscreen';
import { useIdleVisibility } from './useIdleVisibility';
import { describeStatus, type WorkspaceState } from './workspaceState';
import styles from './FocusToolbar.module.css';

interface Props {
  readonly title: string;
  readonly state: WorkspaceState;
  readonly actions: ArtworkActions;
  readonly drawerOpen: boolean;
  readonly onToggleDrawer: () => void;
  readonly onExitFocus: () => void;
  /** Absent when the browser will not do fullscreen; then nothing is offered. */
  readonly fullscreen: Fullscreen | null;
}

export function FocusToolbar({
  title,
  state,
  actions,
  drawerOpen,
  onToggleDrawer,
  onExitFocus,
  fullscreen,
}: Props) {
  const [holdingFocus, setHoldingFocus] = useState(false);

  // Held open while the drawer is open, while a control here has keyboard
  // focus, and while an execution is running or has just failed.
  const hold = drawerOpen || holdingFocus || state.status === 'running' || state.status === 'error';

  const { visible } = useIdleVisibility({ enabled: true, hold });

  const onFocusIn = useCallback(() => setHoldingFocus(true), []);
  const onFocusOut = useCallback(() => setHoldingFocus(false), []);

  return (
    <div
      className={styles.bar}
      data-visible={visible ? 'true' : 'false'}
      onFocus={onFocusIn}
      onBlur={onFocusOut}
      // aria-hidden is deliberately not used when faded: the bar is still
      // operable by keyboard, and hiding it from assistive technology while it
      // remains focusable would be the worst of both.
    >
      <div className={styles.identity}>
        <h2 className={styles.title}>{title}</h2>
        {/*
          `data-state`, not `data-status`: the Run panel's status region is
          identified by `data-status`, and giving this one the same attribute
          made "the run status" ambiguous to anything selecting on it.

          It announces only while the drawer is closed. The Run panel inside the
          drawer says the same thing, and two live regions reporting one run
          means a screen reader reads it out twice.
        */}
        <p
          className={styles.status}
          role="status"
          aria-live={drawerOpen ? 'off' : 'polite'}
          data-state={state.status}
        >
          {describeStatus(state)}
        </p>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.action} aria-expanded={drawerOpen} onClick={onToggleDrawer}>
          Controls
        </button>
        <button type="button" className={styles.action} onClick={actions.share}>
          Share
        </button>
        <ExportMenu actions={actions} triggerClassName={styles.action} />
        {fullscreen !== null && (
          <button type="button" className={styles.action} onClick={fullscreen.toggle}>
            {/*
              The label states what pressing it will do, rather than the
              current state with aria-pressed. Both are correct; a changing
              label is the one people read without being told to.
            */}
            {fullscreen.active ? 'Leave fullscreen' : 'Fullscreen'}
          </button>
        )}
        <button type="button" className={styles.exit} onClick={onExitFocus}>
          Exit focus
        </button>
      </div>

      {/*
        Only ever a refusal, and only for a few seconds.

        A status rather than an alert. Nothing is broken and nothing needs
        attending to — the press simply did not take effect, and Focus mode is
        still doing the job. It is announced once, when it appears, and removes
        itself; there is no control to dismiss because there is nothing to act
        on.
      */}
      {fullscreen?.error != null && (
        <p className={styles.refusal} role="status">
          {/*
            Right-aligned on a line of its own, over the artwork rather than the
            drawer: left-aligned it landed on the white panel, where the warning
            colour was close to invisible. It keeps a quiet dark backing because
            it sits over an arbitrary picture — plain text there is legible
            against some artworks and not others.
          */}
          <span>{fullscreen.error}</span>
        </p>
      )}
    </div>
  );
}
