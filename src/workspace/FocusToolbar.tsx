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
}

export function FocusToolbar({ title, state, actions, drawerOpen, onToggleDrawer, onExitFocus }: Props) {
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

          Failure is the other case where it stays silent, and for the same
          reason from the other direction. The drawer is hidden by a transform
          rather than by `display`, so the Run panel's error alert is in the
          accessibility tree whether the drawer is open or shut — it announces,
          assertively, either way. This region would only be a second voice
          saying less.
        */}
        <p
          className={styles.status}
          role="status"
          aria-live={drawerOpen || state.status === 'error' ? 'off' : 'polite'}
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
        <button type="button" className={styles.exit} onClick={onExitFocus}>
          Exit focus
        </button>
      </div>
    </div>
  );
}
