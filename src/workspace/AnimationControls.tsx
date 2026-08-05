/**
 * Starting and stopping the palette animation.
 *
 * These are the only parts of the animation that React knows about: whether it
 * is running, how fast, and which mode. The phase — where it has got to — never
 * appears here, because updating a component sixty times a second to move a
 * gradient would be an absurd way to spend a frame budget.
 *
 * Nothing here starts on its own. Animation is never running when a project or
 * a shared link is opened, whatever the reader's motion preference, because it
 * is not part of the artwork — it is something being done to it.
 */

import {
  ANIMATION_MODES,
  DEFAULT_ANIMATION,
  describeMode,
  type AnimationSettings,
} from '@/renderer/paletteAnimation';
import styles from './AnimationControls.module.css';

interface Props {
  readonly settings: AnimationSettings;
  readonly onChange: (settings: AnimationSettings) => void;
  /** Puts the artwork back to the palette as saved. */
  readonly onReset: () => void;
  readonly reducedMotion: boolean;
}

export function AnimationControls({ settings, onChange, onReset, reducedMotion }: Props) {
  return (
    <div className={styles.controls}>
      {reducedMotion && !settings.running && (
        <p className={styles.note}>
          This browser is set to reduce motion, so nothing moves until you ask it to.
        </p>
      )}

      <div className={styles.actions}>
        {/*
          One button whose label says what pressing it will do. Pause is never
          hidden behind a mode or a menu: anything that moves has to be
          stoppable without hunting for the control.
        */}
        <button
          type="button"
          className={styles.primary}
          /* Lets the stylesheet mark playback without reading any colour. */
          data-running={settings.running ? 'true' : undefined}
          onClick={() => onChange({ ...settings, running: !settings.running })}
        >
          {settings.running ? 'Pause' : 'Animate palette'}
        </button>

        <button
          type="button"
          className={styles.action}
          onClick={onReset}
          // Nothing to put back before it has moved.
          disabled={!settings.running && settings.speed === DEFAULT_ANIMATION.speed}
        >
          {/*
            Named for what it resets. The toolbar already has a Reset, which
            throws away the whole artwork — two buttons a few centimetres apart
            saying the same word and meaning very different things.
          */}
          Reset animation
        </button>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="animation-mode">
          Movement
        </label>
        <select
          id="animation-mode"
          className={styles.select}
          value={settings.mode}
          onChange={(event) =>
            onChange({ ...settings, mode: event.target.value as AnimationSettings['mode'] })
          }
        >
          {ANIMATION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {describeMode(mode)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="animation-speed">
          Speed <span className={styles.of}>cycles per second</span>
        </label>
        <input
          id="animation-speed"
          className={styles.slider}
          type="range"
          min={0.02}
          max={1}
          step={0.02}
          value={settings.speed}
          aria-valuetext={`${String(settings.speed)} cycles per second`}
          onChange={(event) => onChange({ ...settings, speed: Number(event.target.value) })}
        />
      </div>
    </div>
  );
}
