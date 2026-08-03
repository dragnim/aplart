import { describe, expect, it } from 'vitest';
import { hrefForArtwork, parseRoute } from '@/app/router';

describe('parseRoute', () => {
  it('treats an empty hash as the gallery', () => {
    expect(parseRoute('')).toEqual({ name: 'gallery' });
    expect(parseRoute('#')).toEqual({ name: 'gallery' });
    expect(parseRoute('#/')).toEqual({ name: 'gallery' });
  });

  it('recognises the static pages', () => {
    expect(parseRoute('#/about')).toEqual({ name: 'about' });
    expect(parseRoute('#/help')).toEqual({ name: 'help' });
  });

  it('tolerates trailing slashes', () => {
    expect(parseRoute('#/about/')).toEqual({ name: 'about' });
  });

  it('extracts the preset id from an artwork route', () => {
    expect(parseRoute('#/art/modular-bloom')).toEqual({
      name: 'artwork',
      presetId: 'modular-bloom',
      sharedState: null,
      handoff: null,
    });
  });

  it('extracts shared state from the query portion', () => {
    expect(parseRoute('#/art/modular-bloom?s=AbC-_123')).toEqual({
      name: 'artwork',
      presetId: 'modular-bloom',
      sharedState: 'AbC-_123',
      handoff: null,
    });
  });

  it('ignores query parameters other than the shared state', () => {
    const route = parseRoute('#/art/checker-shift?utm_source=elsewhere');
    expect(route).toEqual({
      name: 'artwork',
      presetId: 'checker-shift',
      sharedState: null,
      handoff: null,
    });

    // A handoff token is read, and is not a shared link: the two are separate
    // fields because they mean different things and must not substitute.
    expect(parseRoute('#/art/julia-set?h=abc123')).toEqual({
      name: 'artwork',
      presetId: 'julia-set',
      sharedState: null,
      handoff: 'abc123',
    });
  });

  it('percent-decodes the preset id', () => {
    expect(parseRoute('#/art/modular%20bloom')).toMatchObject({ presetId: 'modular bloom' });
  });

  it('does not throw on a malformed percent escape', () => {
    expect(parseRoute('#/art/%E0%A4%A')).toMatchObject({ name: 'artwork', presetId: '%E0%A4%A' });
  });

  it('reports anything else as not found, keeping the path for the message', () => {
    expect(parseRoute('#/nope')).toEqual({ name: 'notFound', path: '/nope' });
    expect(parseRoute('#/art')).toEqual({ name: 'notFound', path: '/art' });
    expect(parseRoute('#/art/a/b')).toEqual({ name: 'notFound', path: '/art/a/b' });
  });
});

describe('hrefForArtwork', () => {
  it('builds a bare artwork link', () => {
    expect(hrefForArtwork('modular-bloom')).toBe('#/art/modular-bloom');
  });

  it('appends shared state when given', () => {
    expect(hrefForArtwork('modular-bloom', 'AbC')).toBe('#/art/modular-bloom?s=AbC');
  });

  it('round-trips an id that needs escaping', () => {
    const href = hrefForArtwork('odd id');
    expect(parseRoute(href)).toMatchObject({ presetId: 'odd id' });
  });
});
