/**
 * Four numbers about the world, in the corner.
 *
 * Light instrumentation on a page whose subject is the picture, so it is small,
 * quiet and stationary: no charts, no history, nothing that moves except the
 * values. It sits bottom-left because the bar has the top and the APL panel has
 * the right, and it goes away with the rest of the interface because it is part
 * of the interface.
 *
 * ## Why two of them can be blank
 *
 * Generation and Population are properties of the world as it stands. Births,
 * deaths and activity are properties of the *step that produced it* — so a world
 * that no step produced has none of them, and says so with a dash rather than
 * with zero.
 *
 * That distinction is the whole design. A freshly seeded, randomised, emptied or
 * hand-painted world has not had a generation happen to it, and "no cells
 * changed" would be a claim about Life that nothing had asked Life to make.
 * Painting in particular must never read as births: the rules did not decide it.
 */

import { Fragment } from 'react';
import { activity, population, type LifeWorld } from './lifeEngine';
import styles from './LifeStats.module.css';

interface Props {
  readonly world: LifeWorld;
}

/** An em dash: nothing to report, as distinct from nothing having happened. */
const NOTHING = '—';

const whole = new Intl.NumberFormat('en-GB');

/**
 * One reading, and what it says out loud.
 *
 * `spoken` is present only where the shown form is not a sentence. A signed pair
 * is compact and unambiguous to look at and nearly meaningless to hear — "plus
 * twenty-six slash minus twenty-four" — so the two are separated: the glyphs are
 * hidden from assistive technology and the words are hidden from the screen.
 * Neither is an explanation added to the panel; they are the same fact in the
 * form each reader needs.
 */
interface Reading {
  readonly term: string;
  readonly shown: string;
  readonly spoken?: string;
}

/**
 * Births and deaths as one reading.
 *
 * Signed, because the signs are the point: one number went up and the other went
 * down, and a pair of bare integers would leave the reader to work out which.
 */
function change(world: LifeWorld): Reading {
  if (world.transition === null) {
    return { term: 'Last step', shown: NOTHING, spoken: 'No generation has run yet' };
  }

  const { births, deaths } = world.transition;
  return {
    term: 'Last step',
    shown: `+${whole.format(births)} / −${whole.format(deaths)}`,
    spoken: `${whole.format(births)} born, ${whole.format(deaths)} died`,
  };
}

function activityReading(world: LifeWorld): Reading {
  const share = activity(world);
  return share === null
    ? { term: 'Activity', shown: NOTHING, spoken: 'No generation has run yet' }
    : { term: 'Activity', shown: `${share.toFixed(1)}%` };
}

export function LifeStats({ world }: Props) {
  /*
   * "Last step" rather than "Births / Deaths". The old label read as a running
   * total of every birth and death since the world began, which is not what the
   * numbers are: they describe the one generation that has just been computed,
   * and so does Activity beneath them.
   */
  const rows: readonly Reading[] = [
    { term: 'Generation', shown: whole.format(world.generation) },
    { term: 'Population', shown: whole.format(population(world)) },
    change(world),
    activityReading(world),
  ];

  return (
    /*
     * A definition list, because that is what it is: four terms and their
     * current values. `aria-live` is deliberately absent — these change up to
     * forty-eight times a second, and announcing that would make the page
     * unusable with a screen reader. The canvas already carries a polite live
     * region saying the generation and the population at a human pace.
     *
     * The terms and values are laid out directly by this element rather than
     * wrapped a row at a time, so that all four share one grid and one pair of
     * columns. Wrapped, each row measured its own contents and the panel was as
     * wide as whichever row happened to be longest that frame — which is a
     * readout that twitches while you read it.
     */
    <dl className={styles.panel} aria-label="World statistics">
      {rows.map(({ term, shown, spoken }) => (
        <Fragment key={term}>
          <dt className={styles.term}>{term}</dt>
          <dd className={styles.value}>
            {spoken === undefined ? (
              shown
            ) : (
              <>
                <span aria-hidden="true">{shown}</span>
                {/*
                  Absolutely positioned by the global class, so it takes no room:
                  the panel's dimensions are as fixed as they were before this
                  existed.
                */}
                <span className="visually-hidden">{spoken}</span>
              </>
            )}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
