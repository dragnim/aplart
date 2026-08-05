/**
 * The wordmark's two halves, held to the canonical artwork.
 *
 * The interesting assertion is the first one: the component's two `d` strings,
 * concatenated, must be the source file's path character for character. That is
 * what makes the split a division rather than a redrawing — no rounding, no
 * re-export, no tidying of the numbers. Everything else here guards the frame
 * around it: the view box, the class hooks the theme colours attach to, and the
 * two accessibility modes.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AplArtLogo } from '@/components/branding/AplArtLogo';

const SOURCE_PATH = fileURLToPath(new NodeURL('../../src/assets/branding/aplart_logo.svg', import.meta.url));
const source = readFileSync(SOURCE_PATH, 'utf8');

/** The `d` of the one path in the canonical file. */
function sourcePathData(): string {
  const paths = source.match(/ d="([^"]+)"/gu) ?? [];
  expect(paths).toHaveLength(1);
  return (source.match(/ d="([^"]+)"/u) as RegExpMatchArray)[1] as string;
}

function renderedPaths(container: HTMLElement) {
  const apl = container.querySelector('path[class*="apl"]');
  const art = container.querySelector('path[class*="art"]');
  return { apl, art };
}

describe('the canonical logo asset', () => {
  it('is present, and is a single-path SVG', () => {
    expect(source).toContain('<svg');
    expect(source.match(/<path/gu) ?? []).toHaveLength(1);
  });

  it('declares the view box the component reproduces', () => {
    expect(source).toContain('viewBox="0 0 312 113"');
  });
});

describe('AplArtLogo', () => {
  it('splits the source path without altering one character of it', () => {
    const { container } = render(<AplArtLogo />);
    const { apl, art } = renderedPaths(container);

    const combined = `${apl?.getAttribute('d') ?? ''}${art?.getAttribute('d') ?? ''}`;
    expect(combined).toBe(sourcePathData());
  });

  it('divides the eight subpaths four and four, at the gap between the words', () => {
    const { container } = render(<AplArtLogo />);
    const { apl, art } = renderedPaths(container);

    const aplData = apl?.getAttribute('d') ?? '';
    const artData = art?.getAttribute('d') ?? '';

    // Subpaths are the M-delimited runs; the source has eight.
    expect(aplData.match(/M/gu) ?? []).toHaveLength(4);
    expect(artData.match(/M/gu) ?? []).toHaveLength(4);

    /*
     * And the halves occupy their own horizontal bands: "apl" ends at 150.75 and
     * "art" starts at 160.5. Asserted through the extreme coordinates rather
     * than by parsing, which is enough to catch a split at the wrong subpath.
     */
    expect(aplData).toContain('150.75');
    expect(aplData).not.toContain('311.25');
    expect(artData).toContain('160.5');
    expect(artData).toContain('311.25');
    expect(artData).not.toMatch(/H0V/u);
  });

  it('keeps the source view box, so the proportions cannot drift', () => {
    const { container } = render(<AplArtLogo />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 312 113');
  });

  it('gives each half its own class, so the theme can colour them separately', () => {
    const { container } = render(<AplArtLogo />);
    const { apl, art } = renderedPaths(container);

    expect(apl).not.toBeNull();
    expect(art).not.toBeNull();
    expect(apl).not.toBe(art);
  });

  it('is an image named "APL Art" by default', () => {
    render(<AplArtLogo />);
    expect(screen.getByRole('img', { name: 'APL Art' })).toBeInTheDocument();
  });

  it('is hidden from assistive technology when decorative', () => {
    const { container } = render(<AplArtLogo decorative />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
    expect(svg?.getAttribute('aria-label')).toBeNull();
    // Nothing announced, from either mode's leftovers.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('adds a caller class without dropping its own', () => {
    const { container } = render(<AplArtLogo className="header-logo" />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('class')).toContain('header-logo');
    // The module class carries the sizing and the fills; losing it would leave
    // an unpainted, full-width logo.
    expect((svg?.getAttribute('class') ?? '').split(' ').length).toBeGreaterThan(1);
  });
});
