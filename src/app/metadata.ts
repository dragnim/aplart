/**
 * What each route says about itself, to the tab and to anything that reads tags.
 *
 * A single-page application changes route without the document changing, so the
 * title and the description have to be written on arrival or every page claims
 * to be the one that was loaded first. The title has always been set here; the
 * description and the social tags now come with it, because they answer the same
 * question and drifting apart is the only way they can be wrong.
 *
 * ## What a crawler actually sees
 *
 * Not this. Two things are in the way and both are properties of how the site is
 * hosted rather than of this module.
 *
 * The route lives in the URL's fragment — `#/life` — and a fragment is never
 * sent to a server. Every address therefore returns the same `index.html`.
 * And most social crawlers do not run JavaScript, so the values written below
 * never reach them even when they do follow the link.
 *
 * So `index.html` carries the site's own title, description and card, which is
 * what a crawler gets and what it should get: it describes APL Art, which is
 * what the address it fetched resolves to. What is written here is for the
 * browser tab, for assistive technology announcing a new page, and for anything
 * that reads the live document. Making it true for crawlers as well would mean
 * server-rendered routes or real paths, which is a change of hosting rather
 * than a change of markup.
 */

import { type Route } from './router';

export const SITE_NAME = 'APL Art';

export interface RouteMetadata {
  readonly title: string;
  readonly description: string;
}

/**
 * Life's own description, written once.
 *
 * Names the three things somebody searching would type — Conway's Game of Life,
 * APL, and John Scholes — because they are what the page is actually about, and
 * in that order because that is the order they matter in.
 */
const LIFE_DESCRIPTION =
  'Explore Conway’s Game of Life through John Scholes’ elegant APL formulation, with an interactive simulation running directly in your browser.';

/** What `index.html` already says, for every route that adds nothing of its own. */
const SITE_DESCRIPTION =
  'Create patterns, fractals and generative art with Dyalog APL. Choose a piece, change the code and see what happens.';

export function metadataFor(route: Route): RouteMetadata {
  switch (route.name) {
    case 'gallery':
      return { title: `${SITE_NAME} — tiny programs, infinite patterns`, description: SITE_DESCRIPTION };
    case 'artwork':
      return { title: `${route.presetId} — ${SITE_NAME}`, description: SITE_DESCRIPTION };
    case 'about':
      return { title: `About — ${SITE_NAME}`, description: SITE_DESCRIPTION };
    case 'help':
      return { title: `Help — ${SITE_NAME}`, description: SITE_DESCRIPTION };
    case 'life':
      return { title: `Conway’s Game of Life in APL | ${SITE_NAME}`, description: LIFE_DESCRIPTION };
    case 'notFound':
      return { title: `Not found — ${SITE_NAME}`, description: SITE_DESCRIPTION };
  }
}

/** Sets a `name=`d meta tag, creating it only if the document has none. */
function setNamed(name: string, content: string): void {
  const existing = document.head.querySelector(`meta[name="${name}"]`);
  if (existing !== null) {
    existing.setAttribute('content', content);
    return;
  }
  const created = document.createElement('meta');
  created.setAttribute('name', name);
  created.setAttribute('content', content);
  document.head.append(created);
}

/** The same, for Open Graph, which identifies its tags by `property`. */
function setProperty(property: string, content: string): void {
  const existing = document.head.querySelector(`meta[property="${property}"]`);
  if (existing !== null) {
    existing.setAttribute('content', content);
    return;
  }
  const created = document.createElement('meta');
  created.setAttribute('property', property);
  created.setAttribute('content', content);
  document.head.append(created);
}

/**
 * Writes this route's title and description onto the document.
 *
 * Open Graph and Twitter carry the same two strings rather than variants of
 * them. Three descriptions of one page is three things to keep true, and the
 * differences would be invented rather than meant.
 */
export function applyMetadata(route: Route): void {
  const { title, description } = metadataFor(route);

  document.title = title;
  setNamed('description', description);

  setProperty('og:title', title);
  setProperty('og:description', description);
  // A page of the site rather than a piece of writing, which is what the other
  // values `og:type` offers would claim.
  setProperty('og:type', 'website');

  setNamed('twitter:title', title);
  setNamed('twitter:description', description);
}
