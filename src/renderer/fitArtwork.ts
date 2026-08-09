/**
 * Where an artwork sits inside the box it is drawn in.
 *
 * The canvas element fills its frame, but the artwork is letterboxed inside it
 * rather than stretched — an artwork's aspect ratio is part of it. Anything
 * that has to turn a position on the canvas into a position in the artwork
 * needs the same arithmetic the drawing used, so it lives here and both use it.
 * Two copies of it would drift, and the symptom would be a drag that selects
 * something slightly to the left of what was under the pointer.
 *
 * Unit-agnostic: pass device pixels to draw, CSS pixels to hit-test.
 */
export interface FittedBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Whether an artwork fits inside its box or fills it.
 *
 * `contain` shows all of the artwork and leaves the box's spare axis empty.
 * `cover` fills the box and lets the artwork run off the two long edges.
 *
 * Which is right depends on what the artwork *is*. A seamless pattern has no
 * edges worth preserving — it is a piece of something larger, and showing it
 * with margins is showing a swatch rather than a surface. A plane explorer does:
 * its frame is the view somebody navigated to, and cropping it would silently
 * move the view they chose.
 */
export type ArtworkFit = 'contain' | 'cover';

export function fitArtwork(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
  fit: ArtworkFit = 'contain',
): FittedBox {
  // A zero anywhere would make the scale NaN or Infinity and put the artwork
  // nowhere at all; an empty box is the honest answer.
  if (imageWidth <= 0 || imageHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  /*
   * The only difference between the two is which way this rounds: the smaller
   * ratio leaves the box unfilled, the larger overfills it. The centring below
   * is the same either way — it becomes a negative offset under `cover`, which
   * is exactly the crop, split evenly between the two edges.
   */
  const scale =
    fit === 'cover'
      ? Math.max(boxWidth / imageWidth, boxHeight / imageHeight)
      : Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return { left: (boxWidth - width) / 2, top: (boxHeight - height) / 2, width, height };
}
