/**
 * Lays several rendered images out in a grid.
 *
 * Used when comparing preset parameter defaults or palettes side by side,
 * which is far easier to judge as one picture than as a folder of files.
 */

import { type RgbaSource } from './encodePng';

export interface MontageOptions {
  readonly columns: number;
  readonly gap?: number;
  readonly background?: readonly [number, number, number];
}

export function montage(images: readonly RgbaSource[], options: MontageOptions): RgbaSource {
  const gap = options.gap ?? 8;
  const [bgR, bgG, bgB] = options.background ?? [16, 16, 16];

  const cellWidth = Math.max(...images.map((image) => image.width));
  const cellHeight = Math.max(...images.map((image) => image.height));
  const rows = Math.ceil(images.length / options.columns);

  const width = options.columns * cellWidth + (options.columns + 1) * gap;
  const height = rows * cellHeight + (rows + 1) * gap;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = bgR;
    data[index + 1] = bgG;
    data[index + 2] = bgB;
    data[index + 3] = 255;
  }

  images.forEach((image, index) => {
    const column = index % options.columns;
    const row = Math.floor(index / options.columns);
    const originX = gap + column * (cellWidth + gap);
    const originY = gap + row * (cellHeight + gap);

    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const source = (y * image.width + x) * 4;
        const target = ((originY + y) * width + originX + x) * 4;
        data[target] = image.data[source] as number;
        data[target + 1] = image.data[source + 1] as number;
        data[target + 2] = image.data[source + 2] as number;
        data[target + 3] = 255;
      }
    }
  });

  return { width, height, data };
}
