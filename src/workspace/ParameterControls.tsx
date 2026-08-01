/**
 * Controls generated from a preset's parameter metadata.
 *
 * Each control reads its value out of the code and writes changes back into
 * it, so the editor stays the single source of truth. A control whose
 * assignment the user has removed or rewritten says so instead of quietly
 * overwriting their edit.
 */

import { bindingStateFor, type ParameterValue } from '@/editor/parameterBinding';
import { type ArtworkParameter } from '@/presets/schema';
import styles from './ParameterControls.module.css';

interface Props {
  readonly parameters: readonly ArtworkParameter[];
  readonly code: string;
  readonly onChange: (parameter: ArtworkParameter, value: ParameterValue) => void;
  readonly onRestore: (parameter: ArtworkParameter) => void;
}

export function ParameterControls({ parameters, code, onChange, onRestore }: Props) {
  return (
    <div className={styles.list}>
      {parameters.map((parameter) => (
        <ParameterControl
          key={parameter.id}
          parameter={parameter}
          code={code}
          onChange={onChange}
          onRestore={onRestore}
        />
      ))}
    </div>
  );
}

function ParameterControl({
  parameter,
  code,
  onChange,
  onRestore,
}: {
  readonly parameter: ArtworkParameter;
  readonly code: string;
  readonly onChange: (parameter: ArtworkParameter, value: ParameterValue) => void;
  readonly onRestore: (parameter: ArtworkParameter) => void;
}) {
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

      {(parameter.type === 'integer' || parameter.type === 'number') && (
        <input
          id={controlId}
          className={styles.slider}
          type="range"
          min={parameter.min}
          max={parameter.max}
          step={parameter.step ?? (parameter.type === 'integer' ? 1 : 0.01)}
          value={typeof value === 'number' ? value : 0}
          aria-describedby={describedBy}
          onChange={(event) => onChange(parameter, Number(event.target.value))}
        />
      )}

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
            if (chosen !== undefined) onChange(parameter, chosen.value);
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
            onChange={(event) => onChange(parameter, event.target.checked)}
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
