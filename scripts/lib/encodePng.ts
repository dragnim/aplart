/**
 * A minimal PNG encoder for the thumbnail script.
 *
 * The browser gets PNGs from `canvas.toBlob`, but Node has no canvas, and
 * pulling in a native image library for eight thumbnails would be a poor
 * trade. PNG is a short format when interlacing, palettes and filtering are
 * all left out: a header, one zlib-compressed block of scanlines, and a
 * terminator.
 */

import { deflateSync } from 'node:zlib';

export interface RgbaSource {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA, four bytes per pixel. */
  readonly data: Uint8ClampedArray;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function encodePng(image: RgbaSource): Buffer {
  const { width, height, data } = image;

  // Each scanline is prefixed with its filter type. Zero means "no filtering",
  // which costs a little size and saves a great deal of complexity.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width * 4; x += 1) {
      raw[rowStart + 1 + x] = data[y * width * 4 + x] as number;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(6, 9); // colour type: truecolour with alpha
  header.writeUInt8(0, 10); // compression: deflate
  header.writeUInt8(0, 11); // filter method
  header.writeUInt8(0, 12); // no interlacing

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Enlarges an image by an integer factor, nearest-neighbour.
 *
 * Cell-based artwork must not be smoothed: the hard edge between one cell and
 * the next is the picture.
 */
export function scaleNearest(image: RgbaSource, factor: number): RgbaSource {
  if (factor === 1) return image;

  const width = image.width * factor;
  const height = image.height * factor;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const sourceRow = Math.floor(y / factor) * image.width * 4;
    for (let x = 0; x < width; x += 1) {
      const source = sourceRow + Math.floor(x / factor) * 4;
      const target = (y * width + x) * 4;
      data[target] = image.data[source] as number;
      data[target + 1] = image.data[source + 1] as number;
      data[target + 2] = image.data[source + 2] as number;
      data[target + 3] = image.data[source + 3] as number;
    }
  }

  return { width, height, data };
}

function chunk(type: string, payload: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);

  const typeAndPayload = Buffer.concat([Buffer.from(type, 'ascii'), payload]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndPayload), 0);

  return Buffer.concat([length, typeAndPayload, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
