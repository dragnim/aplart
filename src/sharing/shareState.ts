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
  readonly render: SharedRenderOptions;
  readonly seed?: number;
  readonly title?: string;
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

/** Ceiling on decoded share payloads, so a hostile link cannot exhaust memory. */
export const MAX_DECODED_SHARE_BYTES = 256 * 1024;
