/**
 * What each route tells the tab, and anything else that reads the document.
 *
 * The values themselves are asserted rather than derived, because they are the
 * product decision: what a page is called, and the one sentence describing it.
 * A helper that "does the right thing" without the strings being written down
 * somewhere can be changed without anybody noticing.
 *
 * What a search or social crawler receives is a separate question and not this
 * module's to answer — see the note at the top of `metadata.ts`. These prove the
 * live document is right; nothing here should be read as a claim about crawlers.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { applyMetadata, metadataFor } from '@/app/metadata';
import { parseRoute } from '@/app/router';

const LIFE_TITLE = 'Conway’s Game of Life in APL | APL Art';
const LIFE_DESCRIPTION =
  'Explore Conway’s Game of Life through John Scholes’ elegant APL formulation, with an interactive simulation running directly in your browser.';

beforeEach(() => {
  document.head.innerHTML = '';
  document.title = '';
});

const contentOf = (selector: string) =>
  document.head.querySelector(selector)?.getAttribute('content') ?? null;

describe('what a route calls itself', () => {
  it('gives Game of Life a title that names the thing and the language', () => {
    /*
     * "in APL" is the point of it. There are a great many Game of Life pages;
     * this is the one that runs Scholes's expression, and the title should be
     * enough to tell somebody which they have found.
     */
    expect(metadataFor(parseRoute('#/life')).title).toBe(LIFE_TITLE);
  });

  it('describes Game of Life by what it is, who wrote it and where it runs', () => {
    const { description } = metadataFor(parseRoute('#/life'));

    expect(description).toBe(LIFE_DESCRIPTION);
    // The three things somebody would actually search for.
    expect(description).toContain('Conway’s Game of Life');
    expect(description).toContain('APL');
    expect(description).toContain('John Scholes');
  });

  it('leaves the other routes with the site’s own description', () => {
    for (const hash of ['#/', '#/about', '#/help', '#/art/basket-weave']) {
      const { description } = metadataFor(parseRoute(hash));
      expect(description, hash).toContain('Dyalog APL');
      expect(description, hash).not.toContain('Game of Life');
    }
  });

  it('names every route, including the ones nobody links to', () => {
    for (const hash of ['#/', '#/about', '#/help', '#/life', '#/art/basket-weave', '#/nowhere']) {
      const { title, description } = metadataFor(parseRoute(hash));
      expect(title, hash).not.toBe('');
      expect(description, hash).not.toBe('');
    }
  });
});

describe('writing it onto the document', () => {
  it('sets the title, the description and one matching card', () => {
    applyMetadata(parseRoute('#/life'));

    expect(document.title).toBe(LIFE_TITLE);
    expect(contentOf('meta[name="description"]')).toBe(LIFE_DESCRIPTION);

    /*
     * The same two strings, not three variants of them. Open Graph and Twitter
     * describing a page slightly differently from the page itself is three
     * things to keep true and two of them invented.
     */
    expect(contentOf('meta[property="og:title"]')).toBe(LIFE_TITLE);
    expect(contentOf('meta[property="og:description"]')).toBe(LIFE_DESCRIPTION);
    expect(contentOf('meta[name="twitter:title"]')).toBe(LIFE_TITLE);
    expect(contentOf('meta[name="twitter:description"]')).toBe(LIFE_DESCRIPTION);
    expect(contentOf('meta[property="og:type"]')).toBe('website');
  });

  it('replaces the tags a navigation leaves behind rather than stacking them up', () => {
    applyMetadata(parseRoute('#/life'));
    applyMetadata(parseRoute('#/about'));
    applyMetadata(parseRoute('#/'));

    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[property="og:type"]',
      'meta[name="twitter:title"]',
      'meta[name="twitter:description"]',
    ]) {
      expect(document.head.querySelectorAll(selector), selector).toHaveLength(1);
    }

    // And the last one written is the one showing.
    expect(document.title).toContain('tiny programs');
    expect(contentOf('meta[name="description"]')).not.toContain('Game of Life');
  });

  it('never asks a page not to be indexed', () => {
    for (const hash of ['#/', '#/life', '#/about']) {
      applyMetadata(parseRoute(hash));
      const robots = contentOf('meta[name="robots"]');
      expect(robots === null || !robots.includes('noindex'), hash).toBe(true);
    }
  });
});
