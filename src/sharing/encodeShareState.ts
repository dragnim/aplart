/**
 * Packing a creation into a URL.
 *
 * The payload is JSON, deflated, then base64url-encoded. Deflate earns its
 * place here: APL source is highly repetitive and the encoded form is
 * typically a third of the raw size, which is the difference between a link
 * that works everywhere and one that does not.
 */

import { deflateSync } from 'fflate';
import { SHARE_SCHEMA_VERSION, type SharedArtworkState } from './shareState';

export function encodeShareState(state: SharedArtworkState): string {
  const json = JSON.stringify({ ...state, v: SHARE_SCHEMA_VERSION });
  const compressed = deflateSync(new TextEncoder().encode(json), { level: 9 });
  return toBase64Url(compressed);
}

/**
 * base64url, as used in URLs: `-` and `_` instead of `+` and `/`, and no
 * padding. Standard base64 would need percent-encoding and grow the link.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  // Chunked so a large payload cannot overflow the argument limit of `apply`.
  const CHUNK = 0x8000;
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function fromBase64Url(encoded: string): Uint8Array {
  const padded = encoded.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Builds the full shareable URL for the current page. */
export function buildShareUrl(baseUrl: string, presetId: string, encoded: string): string {
  const [withoutHash] = baseUrl.split('#', 1);
  return `${withoutHash ?? baseUrl}#/art/${encodeURIComponent(presetId)}?s=${encoded}`;
}
