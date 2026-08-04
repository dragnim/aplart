/**
 * The shape of a shared creation, and how it is carried in a URL.
 *
 * Everything needed to rebuild a piece goes in the link itself. Nothing is
 * uploaded to produce a share URL, which is what makes sharing possible with
 * no account and no server.
 */

import { type Rotation } from '@/renderer/renderOptions';

export const SHARE_SCHEMA_VERSION = 1;

export interface SharedArtworkState {
  readonly v: number;
  readonly preset: string;
  readonly code: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly palette: string;
  /**
   * Custom colour stops, compactly: `0-160f0a.50-ff6a13.100-fff1e4`.
   *
   * A string rather than an array of objects because a link's length is
   * something people see. Absent unless the palette is custom, so no existing
   * link changes shape.
   */
  readonly stops?: string;
  /** How escape counts are coloured. Absent unless it differs from the default. */
  readonly colouring?: unknown;
  readonly render: SharedRenderOptions;
  /**
   * How the artwork is repeated. Optional, so a link written before repeating
   * existed is unchanged and opens showing one copy.
   */
  readonly tiling?: SharedTilingState;
  readonly seed?: number;
  readonly title?: string;
}

export interface SharedTilingState {
  readonly mode: string;
  readonly columns: number;
  readonly rows: number;
  readonly scale?: number;
  readonly showSeamGuides?: boolean;
}

export interface SharedRenderOptions {
  readonly invert: boolean;
  readonly rotation: Rotation;
  readonly mirrorH: boolean;
  readonly mirrorV: boolean;
  readonly smooth: boolean;
}

/**
 * Beyond this a link stops being usable: some clients and servers refuse very
 * long URLs, and a link that silently fails to open is worse than a warning.
 */
export const SHARE_URL_WARNING_LENGTH = 2000;

/**
 * Ceiling on the *decompressed* payload, so a hostile link cannot exhaust memory.
 *
 * Enforced as the inflater produces output rather than after it finishes, because
 * deflate compresses repetition enormously: a few kilobytes of zeroes expands to
 * megabytes, and a check that runs afterwards has already paid for the expansion.
 */
export const MAX_DECODED_SHARE_BYTES = 256 * 1024;

/**
 * Ceiling on the *compressed* payload, which is what a link actually carries.
 *
 * Separate from the decoded limit because the two answer different questions —
 * how much a stranger may send, and how much it may become. They used to be one
 * constant, which meant a 256 KB link was accepted for decoding
 * even though no honest one comes close: the longest artwork here compresses to
 * about a kilobyte, and the interface already warns past 2,000 URL characters.
 */
export const MAX_COMPRESSED_SHARE_BYTES = 64 * 1024;

/**
 * The longest Base64 input worth decoding, derived from the byte ceiling.
 *
 * Base64 spends four characters on every three bytes, so this is that ratio plus
 * the few characters padding can add. Checked *before* `atob`, which is the point:
 * decoding first and measuring after means a megabyte of text has already become
 * a megabyte of bytes.
 */
export const MAX_ENCODED_SHARE_CHARS = Math.ceil(MAX_COMPRESSED_SHARE_BYTES / 3) * 4 + 4;
