/**
 * Dragging a region out of the artwork.
 *
 * Reports the region in fractions of the *source* matrix, not of the screen, so
 * the caller never has to know how the artwork happened to be laid out, scaled,
 * rotated or mirrored when it was pressed.
 *
 * Pointer events rather than mouse events, so a finger and a stylus work
 * without a second code path, and the pointer is captured so a drag that leaves
 * the canvas still finishes where it was let go.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clampFraction, displayToSource, type SourceRect } from './displayMapping';
import { fitArtwork } from './fitArtwork';
import { type RenderOptions } from './renderOptions';

/** A rectangle in CSS pixels, relative to the element, for drawing the overlay. */
export interface OverlayRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Below this, a drag was a press.
 *
 * A stray click must not throw the view somewhere unrecoverable, and a
 * pixel-wide selection would zoom in by several thousand times at once.
 */
const MINIMUM_DRAG = 10;

interface Drag {
  readonly bounds: DOMRect;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function useArtworkSelection(options: {
  readonly enabled: boolean;
  /** Dimensions of the drawn image, which set the letterboxing. */
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly renderOptions: RenderOptions;
  readonly onSelect: (rect: SourceRect) => void;
}): {
  readonly overlay: OverlayRect | null;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: () => void;
} {
  const { enabled, imageWidth, imageHeight, renderOptions, onSelect } = options;
  const [drag, setDrag] = useState<Drag | null>(null);

  // Read inside the handlers so they can stay stable across a drag.
  const latest = useRef({ imageWidth, imageHeight, renderOptions, onSelect });
  useEffect(() => {
    latest.current = { imageWidth, imageHeight, renderOptions, onSelect };
  }, [imageWidth, imageHeight, renderOptions, onSelect]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // Primary button only: a right-press opens a menu, and a middle-press
      // scrolls. Neither should start a selection.
      if (!enabled || event.button !== 0) return;

      const bounds = event.currentTarget.getBoundingClientRect();
      // Measured once, at the start. Re-measuring on every move would let a
      // layout change part-way through a drag move the region under the finger.
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;

      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ bounds, x0: x, y0: y, x1: x, y1: y });
    },
    [enabled],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    setDrag((current) =>
      current === null
        ? null
        : {
            ...current,
            x1: event.clientX - current.bounds.left,
            y1: event.clientY - current.bounds.top,
          },
    );
  }, []);

  const onPointerCancel = useCallback(() => setDrag(null), []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const finished = drag;
      setDrag(null);
      if (finished === null) return;

      const x1 = event.clientX - finished.bounds.left;
      const y1 = event.clientY - finished.bounds.top;
      if (Math.max(Math.abs(x1 - finished.x0), Math.abs(y1 - finished.y0)) < MINIMUM_DRAG) return;

      const {
        imageWidth: width,
        imageHeight: height,
        renderOptions: render,
        onSelect: select,
      } = latest.current;
      const box = fitArtwork(width, height, finished.bounds.width, finished.bounds.height);
      if (box.width === 0 || box.height === 0) return;

      const toFraction = (x: number, y: number) => ({
        u: clampFraction((x - box.left) / box.width),
        v: clampFraction((y - box.top) / box.height),
      });

      // Both corners are mapped back through the presentation before anything
      // else happens; under a quarter turn the horizontal drag is the vertical
      // extent of the matrix, so ordering the corners on screen would be wrong.
      const a = displayToSource(toFraction(finished.x0, finished.y0), render);
      const b = displayToSource(toFraction(x1, y1), render);
      select({ u0: a.u, v0: a.v, u1: b.u, v1: b.v });
    },
    [drag],
  );

  // Escape abandons a drag in progress. Stopped from propagating so it does not
  // also unwind Focus mode: the innermost thing the key can mean is this.
  useEffect(() => {
    if (drag === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setDrag(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drag]);

  return {
    overlay: drag === null ? null : overlayFor(drag, imageWidth, imageHeight),
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}

/** The drawn rectangle, clipped to the artwork so it never spills onto the mat. */
function overlayFor(drag: Drag, imageWidth: number, imageHeight: number): OverlayRect | null {
  const box = fitArtwork(imageWidth, imageHeight, drag.bounds.width, drag.bounds.height);
  if (box.width === 0 || box.height === 0) return null;

  const clampX = (value: number) => Math.min(box.left + box.width, Math.max(box.left, value));
  const clampY = (value: number) => Math.min(box.top + box.height, Math.max(box.top, value));

  const left = clampX(Math.min(drag.x0, drag.x1));
  const right = clampX(Math.max(drag.x0, drag.x1));
  const top = clampY(Math.min(drag.y0, drag.y1));
  const bottom = clampY(Math.max(drag.y0, drag.y1));

  return { left, top, width: right - left, height: bottom - top };
}
