/**
 * Which palette the interface follows, and when it follows nothing.
 *
 * The rule differs from the renderer's on purpose, and the difference is the
 * point of this file: the canvas must always draw something, so `paletteFor`
 * answers with the default ramp when a custom palette is unusable. The interface
 * has a better answer available — the colours it already has — so this reports
 * nothing and lets the caller keep them.
 */

import { describe, expect, it } from 'vitest';
import { CUSTOM_PALETTE_ID } from '@/renderer/customPalette';
import { getPalette } from '@/renderer/palettes';
import { defaultRenderOptions, paletteFor } from '@/renderer/renderOptions';
import { accentPaletteFor, paletteSignature } from '@/theme/accentSource';

const stop = (colour: string, position: number) => ({ id: `s${position}`, colour, position });

describe('accentPaletteFor', () => {
  it('follows a named palette', () => {
    const palette = accentPaletteFor(defaultRenderOptions('poolrooms'));
    expect(palette?.id).toBe('poolrooms');
    expect(palette?.colours).toEqual(getPalette('poolrooms').colours);
  });

  it('follows a renamed identifier to where it now points', () => {
    // A share link written before the rename still says `dyalog`.
    expect(accentPaletteFor(defaultRenderOptions('dyalog'))?.id).toBe('ember');
  });

  it('falls back to the default palette for an id it does not know', () => {
    expect(accentPaletteFor(defaultRenderOptions('no-such-ramp'))?.id).toBe('ember');
  });

  it('follows a usable custom palette', () => {
    const options = {
      ...defaultRenderOptions(CUSTOM_PALETTE_ID),
      customStops: [stop('#199b9d', 0), stop('#eafbf8', 100)],
    };

    expect(accentPaletteFor(options)?.colours).toEqual(['#199b9d', '#eafbf8']);
  });

  it('reports nothing for a custom palette with too few stops', () => {
    const options = { ...defaultRenderOptions(CUSTOM_PALETTE_ID), customStops: [stop('#199b9d', 0)] };

    // The renderer still has to draw, so it substitutes a ramp. The interface
    // does not, and says so by answering with null.
    expect(paletteFor(options).colours.length).toBeGreaterThan(1);
    expect(accentPaletteFor(options)).toBeNull();
  });

  it('reports nothing for a custom palette with no stops at all', () => {
    expect(accentPaletteFor(defaultRenderOptions(CUSTOM_PALETTE_ID))).toBeNull();
  });
});

describe('paletteSignature', () => {
  it('is empty for nothing', () => {
    expect(paletteSignature(null)).toBe('');
  });

  it('changes when a colour changes', () => {
    const first = accentPaletteFor({
      ...defaultRenderOptions(CUSTOM_PALETTE_ID),
      customStops: [stop('#199b9d', 0), stop('#eafbf8', 100)],
    });
    const second = accentPaletteFor({
      ...defaultRenderOptions(CUSTOM_PALETTE_ID),
      customStops: [stop('#199b9d', 0), stop('#ffffff', 100)],
    });

    expect(paletteSignature(first)).not.toBe(paletteSignature(second));
  });

  it('does not change when only the positions move', () => {
    const spread = accentPaletteFor({
      ...defaultRenderOptions(CUSTOM_PALETTE_ID),
      customStops: [stop('#199b9d', 0), stop('#eafbf8', 100)],
    });
    const bunched = accentPaletteFor({
      ...defaultRenderOptions(CUSTOM_PALETTE_ID),
      customStops: [stop('#199b9d', 10), stop('#eafbf8', 12)],
    });

    // Dragging a stop along the ramp changes the artwork and must not repaint
    // the interface.
    expect(paletteSignature(bunched)).toBe(paletteSignature(spread));
  });

  it('does not change when two stops share a position', () => {
    const apart = accentPaletteFor({
      ...defaultRenderOptions(CUSTOM_PALETTE_ID),
      customStops: [stop('#199b9d', 40), stop('#eafbf8', 80)],
    });
    const together = accentPaletteFor({
      ...defaultRenderOptions(CUSTOM_PALETTE_ID),
      customStops: [stop('#199b9d', 40), stop('#eafbf8', 40)],
    });

    expect(paletteSignature(together)).toBe(paletteSignature(apart));
  });
});
