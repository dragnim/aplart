/**
 * The artwork display.
 *
 * Redraws when the matrix, palette or appearance settings change, and when the
 * element is resized. The canvas itself is hidden from assistive technology
 * and paired with a text description, because a grid of coloured cells is
 * meaningless to a screen reader but its shape and range are not.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { describeMatrix, type MatrixStats } from '@/matrix/matrixStats';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { type RenderMode } from '@/presets/schema';
import { drawArtwork, drawCellMarker } from './CanvasRenderer';
import { type SourceCell, type SourceRect } from './displayMapping';
import { getPalette } from './palettes';
import { transformMatrix, type RenderOptions } from './renderOptions';
import { useArtworkPointer } from './useArtworkPointer';
import styles from './ArtworkCanvas.module.css';

/**
 * Offered only by presets whose matrix is a patch of a plane.
 *
 * The canvas reports the region and nothing more. What it means — and the fact
 * that it means rewriting three lines of APL — is the workspace's business.
 */
export interface CanvasExploration {
  readonly enabled: boolean;
  readonly onSelect: (rect: SourceRect) => void;
}

/**
 * Pressing a cell to read its value.
 *
 * Offered for every artwork, not only the explorable ones: any matrix has cells
 * worth asking about. `marked` is a cell of the *source* matrix, so turning or
 * mirroring the artwork moves the outline to wherever that cell has gone.
 */
export interface CanvasInspection {
  readonly marked: SourceCell | null;
  readonly onInspect: (cell: SourceCell | null) => void;
}

interface Props {
  readonly matrix: NumericMatrix | null;
  readonly stats: MatrixStats | null;
  readonly mode: RenderMode;
  readonly options: RenderOptions;
  /** Dims the artwork while a new run is in flight, without removing it. */
  readonly busy: boolean;
  readonly canvasRef?: RefObject<HTMLCanvasElement | null>;
  readonly exploration?: CanvasExploration | undefined;
  readonly inspection?: CanvasInspection | undefined;
}

export function ArtworkCanvas({
  matrix,
  stats,
  mode,
  options,
  busy,
  canvasRef,
  exploration,
  inspection,
}: Props) {
  const internalRef = useRef<HTMLCanvasElement>(null);
  const canvas = canvasRef ?? internalRef;
  const frame = useRef<HTMLDivElement>(null);

  // The caller is responsible for only marking a cell this matrix has; it is
  // the only side that knows whether a remembered cell survived a new result.
  const marked = inspection?.marked ?? null;

  useEffect(() => {
    const element = canvas.current;
    const box = frame.current;
    if (element === null || box === null || matrix === null || stats === null) return;

    const paint = () => {
      const { width, height } = box.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const ratio = window.devicePixelRatio || 1;
      drawArtwork(element, { matrix, stats, mode, options }, width, height, ratio);
      // After the artwork, so the outline is not painted over. Repainted with it
      // on every resize, which is why it is inside `paint` rather than beside it.
      if (marked !== null) drawCellMarker(element, marked, matrix, options, width, height, ratio);
    };

    paint();

    // Redraw on resize so the artwork stays sharp rather than being stretched
    // by CSS between layout changes.
    const observer = new ResizeObserver(paint);
    observer.observe(box);
    return () => observer.disconnect();
  }, [matrix, stats, mode, options, canvas, marked]);

  const palette = getPalette(options.paletteId);

  // Described, and hit-tested, at the size the viewer sees — which rotation and
  // mirroring can change.
  const displayed = matrix === null ? null : transformMatrix(matrix, options);

  /*
   * Called before the empty-state return, because a hook cannot be conditional.
   * Selection is off while a run is in flight: a second region chosen before the
   * first has been drawn would queue runs against the public service and land
   * the person somewhere they never chose.
   */
  const pointer = useArtworkPointer({
    enabled: exploration?.enabled === true && !busy && displayed !== null,
    rows: matrix?.rows ?? 0,
    columns: matrix?.columns ?? 0,
    renderOptions: options,
    onSelect: exploration?.onSelect ?? ignore,
    onInspect: inspection?.onInspect ?? ignore,
  });

  if (matrix === null || stats === null || displayed === null) {
    return (
      <div className={styles.frame} ref={frame}>
        <p className={styles.empty}>{busy ? 'Running your code…' : 'Press Run to draw this artwork.'}</p>
      </div>
    );
  }

  const explorable = exploration?.enabled === true && !busy;

  return (
    <div
      className={styles.frame}
      ref={frame}
      style={{ backgroundColor: palette.background ?? 'var(--surface-dark)' }}
      data-busy={busy ? 'true' : undefined}
      data-explorable={explorable ? 'true' : undefined}
    >
      <canvas
        className={styles.canvas}
        ref={canvas}
        role="img"
        aria-label={describeMatrix(displayed, stats, palette.name)}
        onPointerDown={pointer.onPointerDown}
        onPointerMove={pointer.onPointerMove}
        onPointerUp={pointer.onPointerUp}
        onPointerCancel={pointer.onPointerCancel}
      />

      {pointer.overlay !== null && (
        <div
          className={styles.selection}
          aria-hidden="true"
          style={{
            left: `${pointer.overlay.left}px`,
            top: `${pointer.overlay.top}px`,
            width: `${pointer.overlay.width}px`,
            height: `${pointer.overlay.height}px`,
          }}
        />
      )}

      {busy && (
        <div className={styles.busy} aria-hidden="true">
          <span className={styles.spinner} />
        </div>
      )}
    </div>
  );
}

/** A stable no-op, so the selection hook's dependencies do not change each render. */
function ignore() {
  /* nothing to do */
}
