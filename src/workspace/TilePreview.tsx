/**
 * Three by three copies of the artwork, so the joins can be looked at.
 *
 * It renders the artwork itself, through `drawArtwork` — the same function the
 * workspace canvas, the PNG export and the gallery thumbnails go through — into
 * an offscreen canvas, and places that nine times. So there is one description
 * of how a matrix becomes pixels and this is a ninth caller of it, not a second
 * copy of it. No run, no change to the source, no change to the render options:
 * asking the question must not alter the answer.
 *
 * ## Why it draws the artwork rather than copying the one on screen
 *
 * It used to take a snapshot of the workspace canvas at the moment that canvas
 * finished painting. That was measurably wrong in two ways.
 *
 * A snapshot is only as fresh as the last paint, and on a narrow screen the
 * artwork canvas is unmounted for the whole time the controls are showing — so
 * there are no paints at all. Inverting the palette, or pressing Auto tile, left
 * the preview showing the previous artwork beneath a verdict describing the new
 * one: measured, and exactly the contradiction Tile exists to avoid.
 *
 * And a snapshot copies whatever composition is on screen. With Mirror repeat
 * chosen, the preview was nine copies of an already-mirrored grid — the one
 * arrangement in which a join cannot be seen, in the panel whose job is to show
 * joins. Rendering from the matrix means the source is always one plain copy,
 * whatever the artwork is being shown as.
 *
 * ## What still comes from the canvas
 *
 * Only the tick of a running palette animation. The phase lives in a ref and
 * moves without re-rendering anything, so a repaint announcement is the one
 * usable signal that it has moved. Nothing arrives through that channel except
 * "draw again"; where to draw from is decided here.
 *
 * ## Why it also watches its own size
 *
 * This canvas lives in a tab panel that is `hidden` until somebody opens Tile,
 * so the first effect runs against a box of zero by zero. That was the original
 * fault behind a blank preview: a 1×1 canvas stretched across 286 CSS pixels,
 * which reads as one flat averaged colour. A `ResizeObserver` — the mechanism
 * the artwork canvas uses for the same reason — reports the moment the box gains
 * its layout.
 */

import { useEffect, useRef } from 'react';
import { type MatrixStats } from '@/matrix/matrixStats';
import { type NumericMatrix } from '@/matrix/matrixTypes';
import { type RenderMode } from '@/presets/schema';
import { type CanvasAnimation } from '@/renderer/ArtworkCanvas';
import { drawArtwork, type DrawRequest } from '@/renderer/CanvasRenderer';
import { animatePalette } from '@/renderer/paletteAnimation';
import { paletteFor, type RenderOptions } from '@/renderer/renderOptions';
import { DEFAULT_TILING } from '@/renderer/tiling';
import { type PaintSignal } from './paintSignal';
import styles from './TilePreview.module.css';

/**
 * Everything needed to draw this artwork, exactly as the canvas receives it.
 *
 * Bundled rather than listed because it is one idea — "the artwork as it stands"
 * — and because a preview that took a different subset would be a preview of
 * something slightly other than what the viewer is looking at.
 */
export interface TileSource {
  readonly matrix: NumericMatrix | null;
  readonly stats: MatrixStats | null;
  readonly mode: RenderMode;
  readonly options: RenderOptions;
  readonly escape?: DrawRequest['escape'];
  readonly animation?: CanvasAnimation | undefined;
}

interface Props extends TileSource {
  /** Announces that the artwork was repainted; see the note on animation above. */
  readonly painted: PaintSignal;
  readonly labelledBy?: string;
}

/** Three, because a join runs both ways and one boundary shows only one of them. */
const COPIES = 3;

/**
 * The smallest offscreen copy worth rendering, in pixels.
 *
 * A copy is shown at about a third of a small box, and rendering it at exactly
 * that size means every cell of a fine pattern lands on a pixel boundary or does
 * not — which produces moiré that reads as a fault in the artwork rather than in
 * the preview. Rendering larger and letting the browser reduce it, as the
 * workspace canvas already does, keeps the weave a weave.
 */
const MIN_SOURCE = 512;

export function TilePreview({ matrix, stats, mode, options, escape, animation, painted, labelledBy }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const element = canvas.current;
    const box = frame.current;
    if (element === null || box === null || matrix === null || stats === null) return;

    const draw = () => {
      const measured = box.getBoundingClientRect();
      // Nothing worth drawing into. An ordinary state rather than a fault: the
      // panel may still be hidden.
      if (measured.width === 0) return;

      const context = element.getContext('2d');
      if (context === null) return;

      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(measured.width * ratio);
      const height = width;
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
      }

      /*
       * One plain copy of the artwork, whatever composition is on screen. The
       * tiling is replaced rather than overridden so that nothing downstream can
       * disagree about which it got, and the seam guides go with it: a marker
       * drawn to show where the workspace's copies meet would be baked into the
       * thing being inspected here.
       */
      const single = { ...options, tiling: DEFAULT_TILING };
      const base = paletteFor(options);
      const palette =
        animation === undefined
          ? base
          : animatePalette(base, animation.settings.mode, animation.phase.current);

      const side = Math.max(MIN_SOURCE, Math.ceil(width / COPIES));
      copy.current ??= document.createElement('canvas');
      drawArtwork(copy.current, { matrix, stats, mode, options: single, palette, escape }, side, side);

      const tile = width / COPIES;
      context.clearRect(0, 0, width, height);
      // Smoothing on: see MIN_SOURCE. This is the reduction it exists for.
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      for (let row = 0; row < COPIES; row += 1) {
        for (let column = 0; column < COPIES; column += 1) {
          // Rounded outward, so neighbouring copies share an edge rather than
          // leaving a hairline of background between them at fractional widths.
          const left = Math.round(column * tile);
          const top = Math.round(row * tile);
          const right = Math.round((column + 1) * tile);
          const bottom = Math.round((row + 1) * tile);
          context.drawImage(copy.current, left, top, right - left, bottom - top);
        }
      }
    };

    draw();

    // Again whenever this box changes size — which includes going from no size
    // at all to its real one, the first time Tile is opened.
    const observer = new ResizeObserver(draw);
    observer.observe(box);

    // And on each frame of a running animation, whose phase is a ref this
    // effect's dependencies cannot see.
    const unsubscribe = painted.subscribe(draw);

    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [matrix, stats, mode, options, escape, animation, painted]);

  return (
    <div className={styles.frame} ref={frame}>
      <canvas ref={canvas} className={styles.canvas} role="img" aria-labelledby={labelledBy} />
      {/*
        The one join worth looking at hardest: the centre, where four copies
        meet. Drawn over the canvas rather than into it, so it never becomes part
        of anything exported.
      */}
      <span className={styles.crosshair} aria-hidden="true" />
    </div>
  );
}
