/**
 * Appearance settings.
 *
 * Everything here changes only how the existing result is drawn. None of it
 * re-runs the APL, which is why it lives in its own group with its own
 * explanation — the difference between "changes the code" and "changes the
 * picture" is one of the main things this application is trying to teach.
 */

import { palettes } from '@/renderer/palettes';
import { ROTATIONS, type RenderOptions } from '@/renderer/renderOptions';
import styles from './RenderControls.module.css';

interface Props {
  readonly options: RenderOptions;
  readonly availablePaletteIds?: readonly string[] | undefined;
  readonly onChange: (options: Partial<RenderOptions>) => void;
}

export function RenderControls({ options, availablePaletteIds, onChange }: Props) {
  const available =
    availablePaletteIds === undefined
      ? palettes
      : palettes.filter((palette) => availablePaletteIds.includes(palette.id));

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
        </div>
      </fieldset>

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
