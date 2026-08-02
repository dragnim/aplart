/**
 * Appearance settings.
 *
 * Everything here changes only how the existing result is drawn. None of it
 * re-runs the APL, which is why it lives in its own group with its own
 * explanation — the difference between "changes the code" and "changes the
 * picture" is one of the main things this application is trying to teach.
 */

import {
  CUSTOM_PALETTE_ID,
  paletteFromStops,
  stopsAreUsable,
  stopsFromPalette,
} from '@/renderer/customPalette';
import { palettes } from '@/renderer/palettes';
import { paletteFor } from '@/renderer/renderOptions';
import { type AnimationSettings } from '@/renderer/paletteAnimation';
import { AnimationControls } from './AnimationControls';
import { TilingControls } from './TilingControls';
import { type EdgeCheck } from '@/renderer/edgeCheck';
import { DEFAULT_TILING } from '@/renderer/tiling';
import { ColouringControls } from './ColouringControls';
import { type EscapeSettings } from './escapeSettings';
import { PaletteEditor } from './PaletteEditor';
import { ROTATIONS, type RenderOptions } from '@/renderer/renderOptions';
import styles from './RenderControls.module.css';

interface Props {
  readonly options: RenderOptions;
  readonly availablePaletteIds?: readonly string[] | undefined;
  readonly onChange: (options: Partial<RenderOptions>) => void;
  readonly animation: AnimationSettings;
  readonly onAnimationChange: (settings: AnimationSettings) => void;
  readonly onAnimationReset: () => void;
  readonly reducedMotion: boolean;
  /** Present only for a preset that declares the range its values come from. */
  readonly escape?: EscapeSettings | undefined;
  /** How the base tile's opposite edges compare, or null before a first run. */
  readonly edges?: EdgeCheck | null;
}

export function RenderControls({
  options,
  availablePaletteIds,
  onChange,
  animation,
  onAnimationChange,
  onAnimationReset,
  reducedMotion,
  escape,
  edges = null,
}: Props) {
  const available =
    availablePaletteIds === undefined
      ? palettes
      : palettes.filter((palette) => availablePaletteIds.includes(palette.id));

  const custom = options.paletteId === CUSTOM_PALETTE_ID;
  // The swatch shows the stops if there are any, or what selecting Custom would
  // start from if there are not.
  const customPreview = stopsAreUsable(options.customStops)
    ? paletteFromStops(options.customStops)
    : paletteFromStops(stopsFromPalette(paletteFor(options)));

  return (
    <div className={styles.panel}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Palette</legend>
        <div className={styles.palettes} role="radiogroup" aria-label="Palette">
          {available.map((palette) => {
            const selected = palette.id === options.paletteId;
            return (
              <button
                key={palette.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={styles.palette}
                data-selected={selected ? 'true' : undefined}
                onClick={() => onChange({ paletteId: palette.id })}
              >
                <span className={styles.swatch} aria-hidden="true">
                  {palette.colours.map((colour, index) => (
                    <span key={index} style={{ backgroundColor: colour }} />
                  ))}
                </span>
                <span className={styles.paletteName}>{palette.name}</span>
              </button>
            );
          })}

          {/*
            Custom sits with the named ramps because it is the same kind of
            choice. Selecting a named one is also how a custom one is undone —
            which is why the stops are kept rather than discarded, so coming
            back finds the work still there.
          */}
          <button
            type="button"
            role="radio"
            aria-checked={custom}
            className={styles.palette}
            data-selected={custom ? 'true' : undefined}
            onClick={() =>
              onChange({
                paletteId: CUSTOM_PALETTE_ID,
                // Seeded from whatever is on screen, so the editor opens on the
                // artwork as it looks rather than on an arbitrary ramp.
                ...(stopsAreUsable(options.customStops)
                  ? {}
                  : { customStops: stopsFromPalette(paletteFor(options)) }),
              })
            }
          >
            <span className={styles.swatch} aria-hidden="true">
              {customPreview.colours.map((colour, index) => (
                <span key={index} style={{ backgroundColor: colour }} />
              ))}
            </span>
            <span className={styles.paletteName}>Custom</span>
          </button>
        </div>

        {custom && (
          <PaletteEditor
            stops={options.customStops ?? []}
            onChange={(customStops) => onChange({ customStops })}
          />
        )}

        {/*
          Animation belongs with the palette because that is what it moves. It
          changes nothing that is saved: the stops above stay exactly as they
          are while it runs, and pausing puts the artwork back to them.
        */}
        <AnimationControls
          settings={animation}
          onChange={onAnimationChange}
          onReset={onAnimationReset}
          reducedMotion={reducedMotion}
        />
      </fieldset>

      {/*
        After the palette, because it decides which parts of that palette the
        values reach — and before orientation, which changes neither.
      */}
      {escape !== undefined && (
        <ColouringControls
          colouring={escape.colouring}
          range={escape.range}
          onChange={(colouring) => onChange({ colouring })}
        />
      )}

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Orientation</legend>
        <div className={styles.rotations} role="radiogroup" aria-label="Rotation">
          {ROTATIONS.map((rotation) => (
            <button
              key={rotation}
              type="button"
              role="radio"
              aria-checked={options.rotation === rotation}
              className={styles.rotation}
              data-selected={options.rotation === rotation ? 'true' : undefined}
              onClick={() => onChange({ rotation })}
            >
              {rotation}°
            </button>
          ))}
        </div>

        <div className={styles.checks}>
          <Toggle
            label="Mirror horizontally"
            checked={options.mirrorHorizontally}
            onChange={(value) => onChange({ mirrorHorizontally: value })}
          />
          <Toggle
            label="Mirror vertically"
            checked={options.mirrorVertically}
            onChange={(value) => onChange({ mirrorVertically: value })}
          />
          <Toggle
            label="Invert palette"
            checked={options.invert}
            onChange={(value) => onChange({ invert: value })}
          />
          <Toggle
            label="Smooth scaling"
            checked={options.smoothScaling}
            onChange={(value) => onChange({ smoothScaling: value })}
            hint="Off keeps cell edges crisp."
          />
        </div>
      </fieldset>

      {/*
        After orientation, because the base tile is what gets repeated: rotating
        and mirroring shape the copy, and the repeat is built from the result.
      */}
      <TilingControls
        tiling={options.tiling ?? DEFAULT_TILING}
        edges={edges}
        onChange={(tiling) => onChange({ tiling })}
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
  readonly hint?: string;
}) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        {label}
        {hint !== undefined && <span className={styles.hint}> {hint}</span>}
      </span>
    </label>
  );
}
