/**
 * Lets someone delete everything APL Art has kept in their browser.
 *
 * The About page promises nothing is uploaded, which makes this the only place
 * their work exists — so there has to be a way to remove it, and it has to
 * confirm first.
 */

import { useState } from 'react';
import { Dialog } from '@/components/Dialog/Dialog';
import { localProjects } from '@/workspace/useLocalProject';
import styles from './ClearLocalData.module.css';

export function ClearLocalData() {
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);

  const available = localProjects.available;

  return (
    <div className={styles.wrapper}>
      <p className={styles.explanation}>
        {available
          ? 'Your code, palettes and settings for each artwork are kept in this browser only.'
          : 'This browser is not allowing local storage, so nothing is being saved between visits.'}
      </p>

      <button
        type="button"
        className={styles.button}
        disabled={!available}
        onClick={() => setConfirming(true)}
      >
        Clear local data
      </button>

      {/* Announced rather than only shown, so the outcome is not silent. */}
      <p className={styles.result} role="status">
        {cleared ? 'Everything saved in this browser has been removed.' : ''}
      </p>

      <Dialog
        open={confirming}
        title="Clear everything saved here?"
        onClose={() => setConfirming(false)}
        actions={
          <>
            <button type="button" className={styles.button} onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.destructive}
              onClick={() => {
                void localProjects.clear().then(() => {
                  setCleared(true);
                  setConfirming(false);
                });
              }}
            >
              Clear everything
            </button>
          </>
        }
      >
        Every artwork you have edited in this browser will go back to its original. Nothing else is affected,
        and anything you have exported or shared as a link is unaffected.
      </Dialog>
    </div>
  );
}
