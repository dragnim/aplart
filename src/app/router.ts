/**
 * A very small hash router.
 *
 * Hash routing is a deployment requirement rather than a preference: GitHub
 * Pages cannot rewrite unknown paths to index.html, so `/aplart/art/foo` would
 * 404 on a direct visit while `/aplart/#/art/foo` always resolves.
 *
 * Links are ordinary anchors with `href="#/..."`, which keeps middle-click,
 * open-in-new-tab and screen reader link semantics working for free. This
 * module only needs to report the current route and let code navigate
 * programmatically, which is not enough to justify a routing dependency.
 */

import { useSyncExternalStore } from 'react';

export type Route =
  | { readonly name: 'gallery' }
  | { readonly name: 'artwork'; readonly presetId: string; readonly sharedState: string | null }
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

export function hrefForGallery(): string {
  return '#/';
}

export function hrefForArtwork(presetId: string, sharedState?: string): string {
  const base = `#/art/${encodeURIComponent(presetId)}`;
  return sharedState === undefined ? base : `${base}?s=${encodeURIComponent(sharedState)}`;
}

export function navigate(href: string): void {
  window.location.hash = href.startsWith('#') ? href.slice(1) : href;
}

/** Replace the current entry rather than pushing, e.g. when tidying a URL. */
export function replaceRoute(href: string): void {
  const hash = href.startsWith('#') ? href : `#${href}`;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
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
