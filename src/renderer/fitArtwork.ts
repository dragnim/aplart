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

export function fitArtwork(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
): FittedBox {
  // A zero anywhere would make the scale NaN or Infinity and put the artwork
  // nowhere at all; an empty box is the honest answer.
  if (imageWidth <= 0 || imageHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return { left: (boxWidth - width) / 2, top: (boxHeight - height) / 2, width, height };
}
