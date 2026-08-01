import { useCallback, useEffect, useState } from 'react';

/**
 * Hides a chrome overlay while nothing is happening, and brings it straight
 * back when something is.
 *
 * Used for the Focus-mode toolbar. The artwork is meant to dominate, but a
 * toolbar that cannot be recovered is a trap, so this is deliberately eager to
 * reappear and reluctant to disappear.
 *
 * It never hides while `hold` is true. The Focus-mode toolbar holds it open
 * whenever one of its own controls has keyboard focus or a drawer is open —
 * fading out the control someone is using would be indefensible.
 */
export function useIdleVisibility(options: {
  readonly enabled: boolean;
  readonly hold: boolean;
  readonly delayMs?: number;
}): { readonly visible: boolean; readonly wake: () => void } {
  const { enabled, hold, delayMs = 2600 } = options;

  const [visible, setVisible] = useState(true);

  const wake = useCallback(() => {
    setVisible(true);
  }, []);

  /*
   * Only ever schedules the hiding. Nothing here sets the state back to
   * visible: while `hold` is true the returned value reports visible on its
   * own, and every way `hold` can be taken away is preceded by something a
   * person did — a press, a keystroke, moving focus — which wakes it through
   * the listener below. Setting it here as well would be a cascading render
   * that says nothing new.
   */
  useEffect(() => {
    if (!enabled || hold || !visible) return;

    const timer = setTimeout(() => setVisible(false), delayMs);
    return () => clearTimeout(timer);
  }, [enabled, hold, visible, delayMs]);

  useEffect(() => {
    if (!enabled) return;

    /*
     * Any sign of a person brings the toolbar back.
     *
     * `focusin` matters as much as the pointer events: someone tabbing through
     * the overlay must see where they are, and a keyboard user who never moves
     * a mouse would otherwise be navigating something invisible.
     */
    const events: readonly (keyof WindowEventMap)[] = [
      'pointermove',
      'pointerdown',
      'touchstart',
      'keydown',
      'focusin',
      'wheel',
    ];

    for (const event of events) window.addEventListener(event, wake, { passive: true });
    return () => {
      for (const event of events) window.removeEventListener(event, wake);
    };
  }, [enabled, wake]);

  return { visible: enabled ? visible || hold : true, wake };
}
