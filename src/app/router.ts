/**
 * A very small hash router.
 *
 * Hash routing is a deployment requirement rather than a preference: GitHub
 * Pages cannot rewrite unknown paths to index.html, so `/aplart/art/foo` would
 * 404 on a direct visit while `/aplart/#/art/foo` always resolves.
 *
 * Links are ordinary anchors with `href="#/..."`, which keeps middle-click,
 * open-in-new-tab and screen reader link semantics working for free. This
 * module only needs to report the current route and build hrefs, which is not
 * enough to justify a routing dependency.
 */

import { useSyncExternalStore } from 'react';

export type Route =
  | { readonly name: 'gallery' }
  | {
      readonly name: 'artwork';
      readonly presetId: string;
      readonly sharedState: string | null;
      /**
       * A session-only handoff, as written by "Open as Julia set".
       *
       * Not a share: the payload lives in this tab's session storage and the URL
       * carries only a token, so a copied link opens the ordinary artwork rather
       * than running something the recipient did not ask for.
       */
      readonly handoff: string | null;
    }
  | { readonly name: 'about' }
  | { readonly name: 'help' }
  | { readonly name: 'notFound'; readonly path: string };

export function parseRoute(hash: string): Route {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const [rawPath = '', rawQuery = ''] = withoutHash.split('?', 2);
  const query = new URLSearchParams(rawQuery);

  const segments = rawPath.split('/').filter((segment) => segment !== '');

  if (segments.length === 0) return { name: 'gallery' };

  const [first, second] = segments;

  if (segments.length === 1) {
    if (first === 'about') return { name: 'about' };
    if (first === 'help') return { name: 'help' };
  }

  if (segments.length === 2 && first === 'art' && second !== undefined) {
    return {
      name: 'artwork',
      // The preset id came from a URL, so it is untrusted until matched
      // against the preset registry by the page that renders it.
      presetId: safeDecode(second),
      sharedState: query.get('s'),
      handoff: query.get('h'),
    };
  }

  return { name: 'notFound', path: rawPath };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape sequence is not worth throwing over; the id simply
    // will not match a preset and the not-found state will be shown.
    return value;
  }
}

export function hrefForArtwork(presetId: string, sharedState?: string): string {
  const base = `#/art/${encodeURIComponent(presetId)}`;
  return sharedState === undefined ? base : `${base}?s=${encodeURIComponent(sharedState)}`;
}

/** Where "Open as Julia set" navigates to. The token is meaningless outside this tab. */
export function hrefForHandoff(presetId: string, token: string): string {
  return `#/art/${encodeURIComponent(presetId)}?h=${encodeURIComponent(token)}`;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function getSnapshot(): string {
  return window.location.hash;
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => '#/');
  return parseRoute(hash);
}
