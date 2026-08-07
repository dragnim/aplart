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
 *
 * Each control can also show its own working: a disclosure naming the variable it
 * writes and the assignment as the source currently has it, with a way straight to
 * that line in the editor. Everything in it comes from `peekAt`, so a control can
 * never describe a program other than the one on screen.
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
import { peekAt, type PeekView } from './peek';
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
  /** Opens the editor at this control's own line. Changes nothing. */
  readonly onEditApl: (parameter: ArtworkParameter) => void;
  readonly busy: boolean;
}

export function PlayControls({ preset, config, code, onAdjust, onAdjustEnd, onEditApl, busy }: Props) {
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
            peek={peekAt(preset, control, code)}
            gesture={gesture}
            onAdjust={onAdjust}
            onEnd={endGesture}
            onEditApl={onEditApl}
          />
        ))}
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
  peek,
  gesture,
  onAdjust,
  onEnd,
  onEditApl,
}: {
  readonly control: InstantPlayControl;
  readonly parameter: ArtworkParameter | undefined;
  readonly code: string;
  readonly peek: PeekView | null;
  readonly gesture: MutableRefObject<number>;
  readonly onAdjust: (parameter: ArtworkParameter, value: number, gesture: string) => void;
  readonly onEnd: () => void;
  readonly onEditApl: (parameter: ArtworkParameter) => void;
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
        <p className={styles.detached}>The code no longer sets this to a number.</p>
        {/*
          Still offered, and it matters most here: the disclosure is where the
          control says what happened to it and how to get to the line.
        */}
        <PeekDisclosure peek={peek} parameter={parameter} onEditApl={onEditApl} />
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

      <PeekDisclosure peek={peek} parameter={parameter} onEditApl={onEditApl} />
    </div>
  );
}

/**
 * What this control does to the program, on request.
 *
 * A native disclosure, so it is keyboard operable and its state is announced
 * without any of that having to be built. Closed by default: somebody who has just
 * arrived is here to move a slider, and the code is an answer to a question they
 * have not asked yet.
 *
 * Everything in it is read from the source. The assignment is shown as text rather
 * than communicated by highlighting it somewhere, so the relationship survives
 * being read aloud, and it is marked up as code because that is what it is.
 */
function PeekDisclosure({
  peek,
  parameter,
  onEditApl,
}: {
  readonly peek: PeekView | null;
  readonly parameter: ArtworkParameter;
  readonly onEditApl: (parameter: ArtworkParameter) => void;
}) {
  if (peek === null) return null;

  return (
    // Named after the parameter it explains, because the summary reads the same
    // in all three — which is the point of it, and no way to tell them apart.
    <details className={styles.peek} data-control={parameter.id}>
      <summary className={styles.peekSummary}>How this changes the APL</summary>

      <div className={styles.peekBody}>
        {peek.status === 'bound' ? (
          <>
            <p className={styles.peekLine}>
              Changes <code className={styles.variable}>{peek.variable}</code> in the APL.
            </p>
            {/*
              The line as the source has it now. Not built from the slider or the
              configuration: those would agree with it until somebody edited the
              code, which is exactly when a claim like this has to be right.
            */}
            <p className={styles.assignment}>
              <code>{peek.assignment}</code>
            </p>
            <p className={styles.peekDescription}>
              Moving {peek.label} rewrites this line, and the artwork is drawn again when you let go.
            </p>
          </>
        ) : (
          <>
            <p className={styles.peekLine}>
              {peek.status === 'unrepresentable'
                ? `This control is no longer connected to a simple assignment: the code sets ${peek.variable} to an expression.`
                : `This control is no longer connected to a simple assignment: the code no longer sets ${peek.variable}.`}
            </p>
            {/*
              The control's own sentence, which is only worth repeating here: a
              control in this state has no slider, so this is the one place left
              that says what it was for. A bound control has it on screen already,
              directly above, and printing it twice is noise rather than help.
            */}
            <p className={styles.peekDescription}>{peek.description}</p>
          </>
        )}

        {/*
          Named after the control as well, because three buttons reading "Edit the
          APL" are three identical names in a list of what is on the page. The
          visible words are still the first words of the name, so saying "Edit the
          APL" to a voice control still works.
        */}
        <button
          type="button"
          className={styles.peekAction}
          onClick={() => onEditApl(parameter)}
          aria-label={`Edit the APL for ${peek.label}`}
        >
          Edit the APL
        </button>
      </div>
    </details>
  );
}
