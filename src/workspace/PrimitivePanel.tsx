/**
 * "APL used in this piece".
 *
 * Lists the primitives the preset's author picked out, with a one-sentence
 * explanation each. Deliberately not derived from the code: analysing an
 * arbitrary expression is out of scope, and a guess about what a glyph is
 * doing in a particular artwork would be worse than nothing.
 *
 * For the same reason no claim is made that a primitive causes a visual
 * feature. The explanations describe what the primitive does, and nothing more.
 */

import { useState } from 'react';
import { type PrimitiveReference } from '@/presets/schema';
import styles from './PrimitivePanel.module.css';

interface Props {
  readonly primitives: readonly PrimitiveReference[];
}

export function PrimitivePanel({ primitives }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  if (primitives.length === 0) return null;

  return (
    <section className={styles.panel} aria-labelledby="primitives-heading">
      <h2 className={styles.heading} id="primitives-heading">
        APL used in this piece
      </h2>

      <ul className={styles.list}>
        {primitives.map((primitive) => {
          const open = selected === primitive.glyph;
          return (
            <li key={primitive.glyph} className={styles.item}>
              <button
                type="button"
                className={styles.trigger}
                aria-expanded={open}
                onClick={() => setSelected(open ? null : primitive.glyph)}
              >
                <span className={styles.glyph} aria-hidden="true">
                  {primitive.glyph}
                </span>
                <span className={styles.name}>{primitive.name}</span>
              </button>

              {/*
                The explanation is always in the accessibility tree, expanded or
                not, so nothing here depends on hovering or on being able to
                click a small target.
              */}
              <p className={open ? styles.description : 'visually-hidden'}>{primitive.shortDescription}</p>
            </li>
          );
        })}
      </ul>

      <p className={styles.reference}>
        <a href="https://aplwiki.com/wiki/Category:Primitives" rel="noreferrer noopener" target="_blank">
          Full primitive reference on the APL Wiki
        </a>
      </p>
    </section>
  );
}
