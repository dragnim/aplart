/**
 * The APL Art wordmark, inline, so its two halves can be coloured separately.
 *
 * The canonical artwork is `src/assets/branding/aplart_logo.svg` and stays that
 * way: this component carries a copy of its path data, split at the gap between
 * the two words, and nothing else about it is changed. Loading the file through
 * an `<img>` instead would put the geometry inside a separate document, where a
 * custom property set by this application cannot reach it.
 *
 * The split is not a redraw: concatenating the two `d` strings below reproduces
 * the source path exactly, character for character, which the test asserts. The
 * source is eight axis-aligned subpaths; the first four span x 0 → 150.75 and
 * spell "apl", the last four span x 160.5 → 311.25 and spell "art", with 9.75
 * units of nothing between them.
 *
 * `shape-rendering: crispEdges` in the stylesheet is not decoration. Splitting
 * one path into two changes how it antialiases: a path's coverage mask is
 * aligned to its own bounding box, and the halves have different bounds than the
 * whole, so at fractional scales up to two dozen edge pixels came back differing
 * by as much as a third of a channel — invisible, but not identical. Snapping
 * edges to the pixel grid removes the variance completely (measured: zero
 * differing pixels from 24px to 1248px wide) and is what a pixel wordmark wants
 * anyway. So the letterforms are the source's, whatever size they are drawn at.
 */

import styles from './AplArtLogo.module.css';

/** Subpaths 0–3 of the source path: A, P and L. */
const APL_PATH =
  'M18.75 93.75V75H0V37.5H18.75V75H37.5V37.5H18.75V18.75H56.25V93.75H18.75ZM103.5 75V93.75H84.75V112.5H66V18.75H103.5V37.5H84.75V75H103.5ZM122.25 75H103.5V37.5H122.25V75ZM150.75 93.75H132V0H150.75V93.75Z';

/** Subpaths 4–7 of the source path: A, r and t. */
const ART_PATH =
  'M179.25 93.75V75H160.5V37.5H179.25V75H198V37.5H179.25V18.75H216.75V93.75H179.25ZM245.25 93.75H226.5V18.75H264V37.5H245.25V93.75ZM292.5 75H273.75V0H292.5V18.75H311.25V37.5H292.5V75ZM292.5 93.75V75H311.25V93.75H292.5Z';

export interface AplArtLogoProps {
  readonly className?: string | undefined;
  /**
   * Hide it from assistive technology, for when adjacent text already says
   * "APL Art" and announcing it twice would be noise rather than information.
   */
  readonly decorative?: boolean;
}

export function AplArtLogo({ className, decorative = false }: AplArtLogoProps) {
  return (
    <svg
      className={className === undefined ? styles.logo : `${styles.logo} ${className}`}
      viewBox="0 0 312 113"
      /*
       * The source declares `fill="none"` on the root and paints the path
       * itself, so the fill each half uses comes from the stylesheet below and
       * nothing here needs to name a colour.
       */
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : 'APL Art'}
    >
      <path className={styles.apl} d={APL_PATH} />
      <path className={styles.art} d={ART_PATH} />
    </svg>
  );
}
