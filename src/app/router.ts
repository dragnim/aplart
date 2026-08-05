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
      /**
       * The seed a "Start creating" session began from, as written by the
       * gallery's own action.
       *
       * A number rather than a payload, and in the URL rather than in storage:
       * the variation is a pure function of the preset and the seed, so the seed
       * is the whole state. That is what makes reloading, copying the link and
       * pressing Back all show the same artwork instead of a fresh one.
       */
      readonly play: string | null;
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
      play: query.get('play'),
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

/**
 * Where "Start creating" leads: an artwork, and the seed to vary it by.
 *
 * An ordinary link, so it can be middle-clicked, opened in a new tab and read
 * aloud like any other. The seed is written in full rather than shortened —
 * a link somebody may keep should not need decoding to be understood.
 */
export function hrefForPlay(presetId: string, seed: number): string {
  return `#/art/${encodeURIComponent(presetId)}?play=${encodeURIComponent(String(seed))}`;
}

/** Where "Open as Julia set" navigates to. The token is meaningless outside this tab. */
export function hrefForHandoff(presetId: string, token: string): string {
  return `#/art/${encodeURIComponent(presetId)}?h=${encodeURIComponent(token)}`;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/**
 * The last hash that named a route.
 *
 * Every route in this application begins `#/`, so a bare fragment like `#main`
 * is an in-page anchor rather than a destination. Without this it was parsed as
 * a path, matched nothing, and replaced the page with "We could not find that" —
 * so pressing "Skip to main content", the one anchor the site has, destroyed the
 * gallery. Anchors now leave the route alone while the browser still does its own
 * scrolling and focusing.
 */
let routeHash = '#/';

function getSnapshot(): string {
  const hash = window.location.hash;
  if (hash === '' || hash === '#' || hash.startsWith('#/')) {
    routeHash = hash === '' || hash === '#' ? '#/' : hash;
  }
  return routeHash;
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => '#/');
  return parseRoute(hash);
}
