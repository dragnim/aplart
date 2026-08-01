import { useEffect, type RefObject } from 'react';

/**
 * Closes a popup on Escape or on a press outside it.
 *
 * Both are expected of anything that opens over the page: WCAG 2.2 asks for
 * additional content to be dismissible without moving the pointer, and a menu
 * that can only be closed by pressing the button that opened it is a trap for
 * anyone who has moved on.
 *
 * `pointerdown` rather than `click`, so the menu closes as the press begins
 * and cannot swallow the first interaction with whatever is underneath it.
 */
export function useDismissable(
  open: boolean,
  container: RefObject<HTMLElement | null>,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismiss();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const element = container.current;
      if (element === null) return;
      if (!element.contains(event.target as Node)) onDismiss();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, container, onDismiss]);
}
