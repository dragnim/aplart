/**
 * Controls generated from a preset's parameter metadata.
 *
 * Each control reads its value out of the code and writes changes back into
 * it, so the editor stays the single source of truth. A control whose
 * assignment the user has removed or rewritten says so instead of quietly
 * overwriting their edit.
 */

import { bindingStateFor, type ParameterValue } from '@/editor/parameterBinding';
import { Fragment } from 'react';
import { type ArtworkParameter } from '@/presets/schema';
import { type EdgeClaim } from './edgeClaim';
import { LOG_SLIDER_POSITIONS, fromSliderPosition, toSliderPosition } from './sliderScale';
import styles from './ParameterControls.module.css';

interface Props {
  readonly parameters: readonly ArtworkParameter[];
  readonly code: string;
  readonly onChange: (parameter: ArtworkParameter, value: ParameterValue) => void;
  readonly onRestore: (parameter: ArtworkParameter) => void;
  /** Derived from the source that ran, or null before a first run. */
  readonly edges: EdgeClaim | null;
  /**
   * A change somebody has finished making.
   *
   * Absent in the ordinary workspace, where a technical control writes the code
   * and Run draws it — the deliberate two-step that surface has always had. A
   * session passes it, and the artwork redraws when a control is let go, chosen
   * or ticked: within one panel, "the sliders draw and these do not" is a
   * distinction nobody asked for and everybody trips over.
   *
   * A slider raises this on release rather than on every step, which is exactly
   * what the Play sliders do and for the same reason: forty pictures nobody
   * looked at is forty requests to a public service.
   */
  readonly onCommit?: (() => void) | undefined;
}

export function ParameterControls({ parameters, code, onChange, onRestore, edges, onCommit }: Props) {
  return (
    <div className={styles.list}>
      {parameters.map((parameter) => (
        <Fragment key={parameter.id}>
          <ParameterControl
            parameter={parameter}
            code={code}
            onChange={onChange}
            onRestore={onRestore}
            onCommit={onCommit}
          />
          {/*
            Beside the control that decides it, so the claim and the setting it
            depends on are read together.
          */}
          {edges !== null && edges.variable === parameter.variable && <EdgeNote note={edges} />}
        </Fragment>
      ))}
    </div>
  );
}

/**
 * What the artwork that ran can say about its repeated edges.
 *
 * Two things it must not do. It must not describe the preset — only this result,
 * because the same preset produces compatible and incompatible tilings depending
 * on one assignment. And it must not follow the editor: the claim is about the
 * artwork on screen, so it moves when a run replaces that artwork and not when
 * somebody types.
 */
function EdgeNote({ note }: { readonly note: EdgeClaim }) {
  return (
    <div className={styles.edgeNote} data-compatible={note.compatible ? 'true' : 'false'}>
      <p className={styles.edgeTitle}>{note.title}</p>
      <p className={styles.description}>{note.detail}</p>
    </div>
  );
}

function ParameterControl({
  parameter,
  code,
  onChange,
  onRestore,
  onCommit,
}: {
  readonly parameter: ArtworkParameter;
  readonly code: string;
  readonly onChange: (parameter: ArtworkParameter, value: ParameterValue) => void;
  readonly onRestore: (parameter: ArtworkParameter) => void;
  readonly onCommit?: (() => void) | undefined;
}) {
  /*
   * Every way a drag can finish. The pointer is captured by the range input, so
   * a release outside it still arrives here; a key let go ends a keyboard
   * adjustment, and losing focus ends one that was never let go.
   */
  const release =
    onCommit === undefined
      ? {}
      : { onPointerUp: onCommit, onKeyUp: onCommit, onBlur: onCommit, onTouchEnd: onCommit };
  const binding = bindingStateFor(code, parameter);
  const controlId = `parameter-${parameter.id}`;
  const describedBy = parameter.description === undefined ? undefined : `${controlId}-description`;

  if (binding.status !== 'bound') {
    return (
      <div className={styles.control} data-detached="true">
        <div className={styles.header}>
          <span className={styles.label}>{parameter.label}</span>
        </div>
        <p className={styles.detached}>
          {binding.status === 'detached'
            ? 'This control is no longer linked to the code.'
            : 'The code sets this to something this control cannot show.'}
        </p>
        <button type="button" className={styles.restore} onClick={() => onRestore(parameter)}>
          Restore control line
        </button>
      </div>
    );
  }

  const { value } = binding;
  const numeric = typeof value === 'number' ? value : 0;

  // A geometric scale needs a positive, ordered range to map onto.
  const min = parameter.min ?? 0;
  const max = parameter.max ?? 0;
  const logarithmic = parameter.scale === 'logarithmic' && min > 0 && max > min;

  return (
    <div className={styles.control}>
      <div className={styles.header}>
        <label className={styles.label} htmlFor={controlId}>
          {parameter.label}
        </label>
        <output className={styles.value} htmlFor={controlId}>
          {formatDisplay(value)}
        </output>
      </div>

      {parameter.description !== undefined && (
        <p className={styles.description} id={describedBy}>
          {parameter.description}
        </p>
      )}

      {(parameter.type === 'integer' || parameter.type === 'number') &&
        (logarithmic ? (
          /*
           * The slider carries a position; the value is worked out from it. The
           * number the person reads is still the one in the code, shown above,
           * and the range's own text value is deliberately not that number —
           * hence the explicit aria-valuetext, without which a screen reader
           * would announce the position.
           */
          <input
            id={controlId}
            className={styles.slider}
            type="range"
            min={0}
            max={LOG_SLIDER_POSITIONS}
            step={1}
            value={toSliderPosition(numeric, min, max)}
            aria-valuetext={String(numeric)}
            aria-describedby={describedBy}
            onChange={(event) =>
              onChange(parameter, fromSliderPosition(Number(event.target.value), min, max))
            }
            {...release}
          />
        ) : (
          <input
            id={controlId}
            className={styles.slider}
            type="range"
            min={parameter.min}
            max={parameter.max}
            step={parameter.step ?? (parameter.type === 'integer' ? 1 : 0.01)}
            value={numeric}
            aria-describedby={describedBy}
            onChange={(event) => onChange(parameter, Number(event.target.value))}
            {...release}
          />
        ))}

      {parameter.type === 'select' && (
        <select
          id={controlId}
          className={styles.select}
          value={String(value)}
          aria-describedby={describedBy}
          onChange={(event) => {
            const chosen = (parameter.options ?? []).find(
              (option) => String(option.value) === event.target.value,
            );
            if (chosen === undefined) return;
            onChange(parameter, chosen.value);
            // Choosing is the whole gesture: there is no release to wait for.
            onCommit?.();
          }}
        >
          {(parameter.options ?? []).map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {parameter.type === 'boolean' && (
        <label className={styles.toggle}>
          <input
            id={controlId}
            type="checkbox"
            checked={value === true}
            aria-describedby={describedBy}
            onChange={(event) => {
              onChange(parameter, event.target.checked);
              // As with a select: ticking is the decision, not a step towards one.
              onCommit?.();
            }}
          />
          <span>{value === true ? 'On' : 'Off'}</span>
        </label>
      )}
    </div>
  );
}

function formatDisplay(value: ParameterValue): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  return String(value);
}
