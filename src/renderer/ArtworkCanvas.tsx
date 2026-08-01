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
import { drawArtwork } from './CanvasRenderer';
import { getPalette } from './palettes';
import { transformMatrix, type RenderOptions } from './renderOptions';
import styles from './ArtworkCanvas.module.css';

interface Props {
  readonly matrix: NumericMatrix | null;
  readonly stats: MatrixStats | null;
  readonly mode: RenderMode;
  readonly options: RenderOptions;
  /** Dims the artwork while a new run is in flight, without removing it. */
  readonly busy: boolean;
  readonly canvasRef?: RefObject<HTMLCanvasElement | null>;
}

export function ArtworkCanvas({ matrix, stats, mode, options, busy, canvasRef }: Props) {
  const internalRef = useRef<HTMLCanvasElement>(null);
  const canvas = canvasRef ?? internalRef;
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const box = frame.current;
    if (element === null || box === null || matrix === null || stats === null) return;

    const paint = () => {
      const { width, height } = box.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      drawArtwork(element, { matrix, stats, mode, options }, width, height, window.devicePixelRatio || 1);
    };

    paint();

    // Redraw on resize so the artwork stays sharp rather than being stretched
    // by CSS between layout changes.
    const observer = new ResizeObserver(paint);
    observer.observe(box);
    return () => observer.disconnect();
  }, [matrix, stats, mode, options, canvas]);

  const palette = getPalette(options.paletteId);

  if (matrix === null || stats === null) {
    return (
      <div className={styles.frame} ref={frame}>
        <p className={styles.empty}>{busy ? 'Running your code…' : 'Press Run to draw this artwork.'}</p>
      </div>
    );
  }

  // Described at the size the viewer sees, which rotation can change.
  const displayed = transformMatrix(matrix, options);

  return (
    <div
      className={styles.frame}
      ref={frame}
      style={{ backgroundColor: palette.background ?? 'var(--surface-dark)' }}
      data-busy={busy ? 'true' : undefined}
    >
      <canvas
        className={styles.canvas}
        ref={canvas}
        role="img"
        aria-label={describeMatrix(displayed, stats, palette.name)}
      />
      {busy && (
        <div className={styles.busy} aria-hidden="true">
          <span className={styles.spinner} />
        </div>
      )}
    </div>
  );
}
