/**
 * Pressing and dragging on the artwork.
 *
 * Two gestures, told apart by how far the pointer moved: a press picks out a
 * single cell, and a drag picks out a region. A gesture is only ever one of the
 * two — a drag that ends must not also be read as a press on the cell it
 * happened to finish over, which would zoom and then immediately report a value
 * from the view being left behind.
 *
 * Everything is reported in the coordinates of the *source* matrix, not of the
 * screen, so the caller never has to know how the artwork happened to be laid
 * out, scaled, rotated or mirrored when it was pressed.
 *
 * Pointer events rather than mouse events, so a finger and a stylus work
 * without a second code path, and the pointer is captured so a drag that leaves
 * the canvas still finishes where it was let go.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  clampFraction,
  displayToSource,
  displayedShape,
  sourceCellAt,
  type SourceCell,
  type SourceRect,
} from './displayMapping';
import { fitArtwork } from './fitArtwork';
import { tileAt, tileCounts, tileGrid, tileParity, unreflect } from './tiling';
import { type RenderOptions } from './renderOptions';
import { type ArtworkFit } from './fitArtwork';

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

export function useArtworkPointer(options: {
  /** Whether a drag may select a region. Pressing to inspect is separate. */
  readonly enabled: boolean;
  /*
   * The shape of the *source* matrix in cells — not rendered pixels, and not the
   * displayed shape. A quarter turn transposes what the viewer sees, and the
   * displayed shape is worked out from this rather than passed in, so a caller
   * cannot supply one where the other was wanted.
   */
  readonly rows: number;
  readonly columns: number;
  readonly renderOptions: RenderOptions;
  /** Must match what the canvas drew with, or a press lands on the wrong cell. */
  readonly fit?: ArtworkFit;
  readonly onSelect: (rect: SourceRect) => void;
  /** A press on a cell, or null for a press that missed the artwork. */
  readonly onInspect: (cell: SourceCell | null, at?: { u: number; v: number }) => void;
}): {
  readonly overlay: OverlayRect | null;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: () => void;
} {
  const { enabled, rows, columns, renderOptions, onSelect, onInspect, fit = 'contain' } = options;
  const [drag, setDrag] = useState<Drag | null>(null);

  // Read inside the handlers so they can stay stable across a drag.
  const latest = useRef({ rows, columns, renderOptions, onSelect, onInspect, fit });
  useEffect(() => {
    latest.current = { rows, columns, renderOptions, onSelect, onInspect, fit };
  }, [rows, columns, renderOptions, onSelect, onInspect, fit]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    // Primary button only: a right-press opens a menu, and a middle-press
    // scrolls. Neither should start a selection.
    if (event.button !== 0) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    // Measured once, at the start. Re-measuring on every move would let a
    // layout change part-way through a drag move the region under the finger.
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ bounds, x0: x, y0: y, x1: x, y1: y });
  }, []);

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

      const {
        rows: sourceRows,
        columns: sourceColumns,
        renderOptions: render,
        onSelect: select,
        onInspect: inspect,
      } = latest.current;
      const shown = displayedShape(sourceRows, sourceColumns, render);
      const { columns: across, rows: down } = tileCounts(render.tiling);
      const grid = tileGrid(
        shown.columns,
        shown.rows,
        across,
        down,
        finished.bounds.width,
        finished.bounds.height,
        render.tiling?.scale ?? 1,
        render.tiling?.mode === 'mirror-repeat',
        latest.current.fit,
      );
      const box = grid.region;
      if (box.width === 0 || box.height === 0) return;

      const moved = Math.max(Math.abs(x1 - finished.x0), Math.abs(y1 - finished.y0));

      /*
       * A press, not a drag: report the cell under it and stop. Returning here
       * is what keeps the two gestures exclusive — a drag never also inspects,
       * and a press never also zooms.
       */
      if (moved < MINIMUM_DRAG || !enabled) {
        /*
         * Which copy was pressed, and where inside it. Every copy is the same
         * artwork, so the answer is the same source cell wherever the press
         * landed — the repeat is a way of looking at one matrix, not a larger
         * one. Returns null off the composition entirely, so a press on the mat
         * beside the artwork misses rather than being rounded onto an edge cell.
         */
        const hit = tileAt(grid, x1, y1);
        if (hit === null) {
          inspect(null);
          return;
        }

        /*
         * Two layers, unwound outermost first. The composition may have
         * reflected this copy, so that is undone here; the artwork's own
         * Rotate and Mirror settings were applied when the tile was rendered
         * and `displayToSource` undoes those. Reversing them in one step would
         * let a mirrored copy cancel a mirror the user had chosen, and a press
         * would read the artwork from the wrong side.
         */
        const within = unreflect(hit, tileParity(grid, hit.column, hit.row));
        const source = displayToSource(within, render);

        // Where the press landed across the whole artwork region, not within
        // its copy: the panel is placed against the region, not against a tile.
        const across = {
          u: (x1 - box.left) / box.width,
          v: (y1 - box.top) / box.height,
        };
        inspect(sourceCellAt(source, sourceRows, sourceColumns), across);
        return;
      }

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
    [drag, enabled],
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

  const shown = displayedShape(rows, columns, renderOptions);

  return {
    overlay: drag === null ? null : overlayFor(drag, shown.columns, shown.rows),
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
