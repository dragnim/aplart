/**
 * The three controls somebody meets first.
 *
 * A relabelling of parameters the workspace already has, not a second way of
 * setting them: each control reads its value out of the visible APL and writes
 * changes back into it, so the code stays the single source of truth and the
 * technical sliders below agree with these without being told to.
 *
 * The words come from the preset. This component knows that a Play control has a
 * name, a sentence and two ends; it does not know that one of them is called
 * Complexity, and it must not — that is the preset's judgement about its own
 * artwork.
 *
 * Continuous movement is one action. Dragging reports every step, so the code and
 * the picture keep up, but the run waits for the release and so does the undo
 * entry: the gesture is what somebody did, not the forty values it passed
 * through.
 */

import { useCallback, useRef, type MutableRefObject } from 'react';
import { numberAssignedTo } from '@/editor/parameterBinding';
import {
  parameterForControl,
  playRange,
  playStep,
  type InstantPlayConfig,
  type InstantPlayControl,
} from '@/presets/instantPlay';
import { type ArtworkParameter, type ArtworkPreset } from '@/presets/schema';
import styles from './PlayControls.module.css';

interface Props {
  readonly preset: ArtworkPreset;
  readonly config: InstantPlayConfig;
  /** The visible APL, which every control reads its own value from. */
  readonly code: string;
  /** A step of a gesture: writes the value, does not run. */
  readonly onAdjust: (parameter: ArtworkParameter, value: number, gesture: string) => void;
  /** The gesture ended, so the artwork can be drawn once. */
  readonly onAdjustEnd: () => void;
  readonly onRandomise: () => void;
  readonly onUndo: () => void;
  /** What Undo would take back, or null when there is nothing behind you. */
  readonly undoLabel: string | null;
  readonly onSaveImage: () => void;
  readonly onShare: () => void;
  /** False before the first artwork exists, when there is nothing to save. */
  readonly canSave: boolean;
  readonly busy: boolean;
}

export function PlayControls({
  preset,
  config,
  code,
  onAdjust,
  onAdjustEnd,
  onRandomise,
  onUndo,
  undoLabel,
  onSaveImage,
  onShare,
  canSave,
  busy,
}: Props) {
  /*
   * Which gesture is in progress, as a number that only ever goes up.
   *
   * A ref rather than state: it changes on pointer and key events that must not
   * re-render anything, and its only reader is the next adjustment. Bumping it is
   * what closes an undo entry, so a second drag of the same slider is a second
   * step back rather than being folded into the first.
   */
  const gesture = useRef(0);

  const endGesture = useCallback(() => {
    gesture.current += 1;
    onAdjustEnd();
  }, [onAdjustEnd]);

  return (
    <section className={styles.panel} aria-labelledby="play-heading">
      <h2 className={styles.heading} id="play-heading">
        Make it yours
      </h2>

      <div className={styles.controls}>
        {config.controls.map((control) => (
          <PlayControl
            key={control.parameterId}
            control={control}
            parameter={parameterForControl(preset, control)}
            code={code}
            gesture={gesture}
            onAdjust={onAdjust}
            onEnd={endGesture}
          />
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onRandomise}>
          Randomise
        </button>
        <button
          type="button"
          className={styles.action}
          onClick={onUndo}
          disabled={undoLabel === null}
          /*
           * "Undo" plus what it would take back, so a screen reader user knows
           * what is behind them without having to try it. The visible word is
           * still the first word of the name, which is what keeps voice control
           * working.
           */
          aria-label={undoLabel === null ? 'Undo' : `Undo ${undoLabel}`}
        >
          Undo
        </button>
        <button type="button" className={styles.action} onClick={onSaveImage} disabled={!canSave}>
          Save image
        </button>
        <button type="button" className={styles.action} onClick={onShare}>
          Share
        </button>
      </div>

      {/*
        Said once, quietly, rather than on every control: three sliders that each
        explained when they draw would be three copies of one sentence.
      */}
      <p className={styles.note}>{busy ? 'Drawing…' : 'Let go of a slider to draw the artwork again.'}</p>
    </section>
  );
}

function PlayControl({
  control,
  parameter,
  code,
  gesture,
  onAdjust,
  onEnd,
}: {
  readonly control: InstantPlayControl;
  readonly parameter: ArtworkParameter | undefined;
  readonly code: string;
  readonly gesture: MutableRefObject<number>;
  readonly onAdjust: (parameter: ArtworkParameter, value: number, gesture: string) => void;
  readonly onEnd: () => void;
}) {
  /*
   * Validation guarantees the parameter exists and is numeric, and the gallery
   * only offers Play for a preset that validated. This is the belt: a control
   * that cannot find its parameter renders nothing rather than a slider bound to
   * nowhere.
   */
  if (parameter === undefined) return null;

  const value = numberAssignedTo(code, parameter.variable);
  const range = playRange(parameter, control);
  const step = playStep(parameter);

  const id = `play-${control.parameterId}`;
  const describedBy = `${id}-description`;

  /*
   * The code has been edited into something this control cannot represent — an
   * expression where a number was. Play says so rather than showing a slider
   * whose position is a guess; the full workspace below offers to put the line
   * back, which is where that repair belongs.
   */
  if (value === null) {
    return (
      <div className={styles.control} data-detached="true">
        <span className={styles.label}>{control.label}</span>
        <p className={styles.detached}>
          The code no longer sets this to a number. Open the code below to put it back.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.control}>
      <div className={styles.header}>
        <label className={styles.label} htmlFor={id}>
          {control.label}
        </label>
        <output className={styles.value} htmlFor={id}>
          {value}
        </output>
      </div>

      <p className={styles.description} id={describedBy}>
        {control.description}
        {/*
          The ends in words for somebody who cannot see them under the track. The
          visible pair below is marked decorative, so without this the direction
          of the control would be available to sighted users only — and "Calm to
          Intricate" is the part that says what the numbers mean.
        */}
        {control.endpoints !== undefined && (
          <span className="visually-hidden">{` From ${control.endpoints.low} to ${control.endpoints.high}.`}</span>
        )}
      </p>

      <input
        id={id}
        className={styles.slider}
        type="range"
        min={range.min}
        max={range.max}
        step={step}
        value={Math.min(range.max, Math.max(range.min, value))}
        aria-describedby={describedBy}
        onChange={(event) =>
          onAdjust(parameter, Number(event.target.value), `play:${control.parameterId}:${gesture.current}`)
        }
        /*
         * Every way a gesture can finish. The pointer is captured by the range
         * itself, so its release lands here; a key is let go here; and leaving
         * the control ends whatever it was doing, however it was being driven.
         */
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        onKeyUp={onEnd}
        onBlur={onEnd}
      />

      {control.endpoints !== undefined && (
        /*
         * The ends in words, which is what a number cannot say: 19 means nothing
         * to somebody who has not seen the artwork change. Presentation only —
         * the slider already announces its value and its range.
         */
        <div className={styles.ends} aria-hidden="true">
          <span>{control.endpoints.low}</span>
          <span>{control.endpoints.high}</span>
        </div>
      )}
    </div>
  );
}
