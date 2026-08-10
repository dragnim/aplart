/**
 * "The artwork has just been painted."
 *
 * A notification and nothing more: no pixels travel through here. The Tile
 * preview draws the artwork itself, from the same matrix and the same renderer,
 * so all it needs from the canvas is the one thing it cannot derive from props —
 * where a running palette animation has got to, which lives in a ref and
 * therefore never re-renders anything.
 *
 * It used to carry a copy of the canvas, and that was the wrong shape. A copy of
 * the screen is only as fresh as the last time the screen was drawn, and on a
 * narrow layout the artwork canvas is unmounted for as long as the controls are
 * showing — so changing the palette, or pressing Auto tile, left the preview
 * displaying an artwork that no longer existed. Deriving the preview from the
 * data instead makes that impossible rather than unlikely.
 *
 * Imperative on purpose. A counter in React state would re-render the workspace,
 * which hands the canvas a fresh animation prop, which repaints, which announces
 * again — a loop that did in fact hang the test run when this was first built.
 */

export interface PaintSignal {
  /** Returns an unsubscribe function. */
  readonly subscribe: (listener: () => void) => () => void;
  readonly announce: () => void;
}

export function createPaintSignal(): PaintSignal {
  const listeners = new Set<() => void>();

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    announce: () => {
      for (const listener of listeners) listener();
    },
  };
}
