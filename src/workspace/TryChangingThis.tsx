/**
 * "Try changing this".
 *
 * Prompts written for the specific preset, collapsed by default. Collapsed
 * because the specification is right that experienced users should not be
 * interrupted with tutorial material — but present, because someone who has
 * never seen APL needs somewhere obvious to start.
 *
 * A `<details>` element rather than a bespoke disclosure: it is keyboard
 * operable, announced correctly, and works before JavaScript has run.
 */

import styles from './TryChangingThis.module.css';

interface Props {
  readonly prompts: readonly string[];
  /** Beginner pieces open the panel; harder ones leave it shut. */
  readonly openByDefault: boolean;
}

export function TryChangingThis({ prompts, openByDefault }: Props) {
  if (prompts.length === 0) return null;

  return (
    <details className={styles.panel} open={openByDefault}>
      <summary className={styles.summary}>Try changing this</summary>
      <ul className={styles.list}>
        {prompts.map((prompt) => (
          <li key={prompt}>{prompt}</li>
        ))}
      </ul>
    </details>
  );
}
