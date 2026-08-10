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
import { DEFAULT_TILING } from '@/renderer/tiling';
import { type EdgeCheck } from '@/renderer/edgeCheck';
import { type AnimationSettings } from '@/renderer/paletteAnimation';
import { AnimationControls } from './AnimationControls';
import { ColouringControls } from './ColouringControls';
import { type EscapeSettings } from './escapeSettings';
import { PaletteEditor } from './PaletteEditor';
import { TilingControls } from './TilingControls';
import { ROTATIONS, type RenderOptions } from '@/renderer/renderOptions';
import styles from './RenderControls.module.css';

interface Props {
  readonly options: RenderOptions;
  readonly availablePaletteIds?: readonly string[] | undefined;
  readonly onChange: (options: Partial<RenderOptions>) => void;
  /**
   * Whether this panel owns the repeat controls.
   *
   * True only for an artwork with no Tile tab. The two must never both show
   * them: one set of controls, in the place that can explain what they mean for
   * this particular artwork.
   */
  readonly composition?: boolean;
  /** How the base tile's opposite edges compare, or null before a first run. */
  readonly edges?: EdgeCheck | null;
  /** Offered only where there is a workspace history for it to be a step in. */
  readonly onRandomPalette?: (() => void) | undefined;
  readonly animation: AnimationSettings;
  readonly onAnimationChange: (settings: AnimationSettings) => void;
  readonly onAnimationReset: () => void;
  readonly reducedMotion: boolean;
  /** Present only for a preset that declares the range its values come from. */
  readonly escape?: EscapeSettings | undefined;
  /**
   * Whether this artwork draws one square per matrix cell.
   *
   * Only the Display control's wording depends on it: "each calculated matrix
   * cell as a crisp square" is true of a cell-rendered artwork and false of one
   * that draws a motif per cell.
   */
  readonly cells?: boolean;
  /**
   * Which half of these controls to render.
   *
   * The colour of an artwork and the shape of it are different questions, and the
   * session panel asks them in different tabs — but they are one set of options
   * over one piece of state, so this renders a subset rather than splitting into
   * two components that would each need their own copy of it.
   *
   * `both` is the ordinary workspace, where they have always been one list.
   */
  readonly section?: 'colour' | 'form' | 'both';
}

export function RenderControls({
  options,
  availablePaletteIds,
  onChange,
  onRandomPalette,
  composition = false,
  edges = null,
  animation,
  onAnimationChange,
  onAnimationReset,
  reducedMotion,
  escape,
  cells = true,
  section = 'both',
}: Props) {
  const colour = section !== 'form';
  const form = section !== 'colour';
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
      {colour && (
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

          {/*
           * For somebody who likes the pattern they have and only wants it in
           * other colours. It sits under the ramps because those are what it
           * chooses between, and it is the one control here that does not name
           * what it will produce — which is the whole of its appeal.
           */}
          {onRandomPalette !== undefined && (
            <button type="button" className={styles.randomPalette} onClick={onRandomPalette}>
              Random palette
            </button>
          )}

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

            In a session it is a mode of its own — moving an artwork is a
            creative act rather than a footnote to choosing its colours — so this
            renders it only where the controls are one long column.
          */}
          {section === 'both' && (
            <AnimationControls
              settings={animation}
              onChange={onAnimationChange}
              onReset={onAnimationReset}
              reducedMotion={reducedMotion}
            />
          )}
        </fieldset>
      )}

      {/*
        Inverting is a palette operation, so in a session it belongs with the
        palette. It has historically sat with the mirrors, and still does in the
        ordinary workspace, where the whole list is one column.
      */}
      {section === 'colour' && (
        <div className={styles.checks}>
          <Toggle
            label="Invert palette"
            checked={options.invert}
            onChange={(value) => onChange({ invert: value })}
          />
        </div>
      )}

      {/*
        After the palette, because it decides which parts of that palette the
        values reach — and before orientation, which changes neither.
      */}
      {colour && escape !== undefined && (
        <ColouringControls
          colouring={escape.colouring}
          range={escape.range}
          onChange={(colouring) => onChange({ colouring })}
        />
      )}

      {form && (
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
            {/*
            Invert stays here in the ordinary workspace, where these have always
            been one list, and moves to the Colour tab in a session: it inverts a
            palette, whatever it has historically sat beside.
          */}
            {section === 'both' && (
              <Toggle
                label="Invert palette"
                checked={options.invert}
                onChange={(value) => onChange({ invert: value })}
              />
            )}
          </div>
        </fieldset>
      )}

      {form && (
        <DisplayControl
          smooth={options.smoothScaling}
          cells={cells}
          onChange={(smoothScaling) => onChange({ smoothScaling })}
        />
      )}

      {/*
        Repeating, for the artworks that have nowhere better to put it.

        An artwork that can genuinely tile has a Tile tab, and this moves there
        whole: it is not duplicated, because a visitor who found two copies would
        reasonably expect them to mean different things. An artwork that cannot
        tile has no such tab — a panel whose only message is "not seamless" is
        not worth a press — but repeating one is still a useful composition, so
        the controls stay here for those.
      */}
      {form && composition && (
        <TilingControls
          tiling={options.tiling ?? DEFAULT_TILING}
          edges={edges}
          onChange={(tiling) => onChange({ tiling })}
          seamless={false}
        />
      )}
    </div>
  );
}

/**
 * Crisp cells, or interpolation between them.
 *
 * Two named choices rather than the "smooth scaling" tick this replaces, because
 * the honest description of each is a sentence and a tick had room for neither.
 * What the wording has to protect: one of these shows the matrix and the other
 * blurs the gaps between its cells. Neither calculates anything, so neither may
 * be called more detail, higher resolution or better quality — there is exactly
 * as much information on screen either way.
 */
function DisplayControl({
  smooth,
  cells,
  onChange,
}: {
  readonly smooth: boolean;
  /** Whether this artwork draws one square per matrix cell, or motifs. */
  readonly cells: boolean;
  readonly onChange: (smooth: boolean) => void;
}) {
  const choices = [
    {
      smooth: false,
      label: 'Pixel',
      description: cells
        ? 'Shows each calculated matrix cell as a crisp square.'
        : 'Keeps the drawn edges crisp.',
    },
    {
      smooth: true,
      label: 'Smooth',
      description: cells
        ? 'Softens the display between calculated cells. It does not calculate additional detail.'
        : 'Softens the drawn edges. It does not calculate additional detail.',
    },
  ];

  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>Display</legend>
      <div className={styles.displayModes} role="radiogroup" aria-label="Display">
        {choices.map((choice) => (
          <button
            key={choice.label}
            type="button"
            role="radio"
            aria-checked={smooth === choice.smooth}
            className={styles.displayMode}
            data-selected={smooth === choice.smooth ? 'true' : undefined}
            onClick={() => onChange(choice.smooth)}
          >
            {choice.label}
          </button>
        ))}
      </div>

      {/* Only the chosen one, so the panel stays compact. */}
      <p className={styles.displayNote}>
        {choices.find((choice) => choice.smooth === smooth)?.description ?? ''}
      </p>
    </fieldset>
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
