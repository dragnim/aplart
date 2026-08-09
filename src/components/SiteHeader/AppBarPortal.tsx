/**
 * Puts a route's contextual controls into the app bar.
 *
 * The bar is rendered by `App`, above the route, and it outlives every
 * navigation. What goes in the middle of it belongs to whichever route is
 * showing — and that route's state belongs to the route. Lifting the workspace's
 * state up to `App` so the bar could read it would put the artwork, the result
 * and the history above the component that owns them, and remount them on
 * changes that have nothing to do with either.
 *
 * So the DOM travels instead of the state. React keeps the children in this
 * component's tree — context, events and re-renders all behave as though they
 * were rendered here — and only the browser sees them in the bar.
 *
 * Nothing renders until the slot exists, which is one frame after the first
 * paint. A bar that is briefly a wordmark and a menu is the same bar; a crash
 * for want of a container would not be.
 */

import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { APP_BAR_SLOT_ID } from './SiteHeader';

/*
 * The slot is a piece of the document rather than a piece of React state, and
 * this is the sanctioned way to read one: React asks for it again after every
 * commit and re-renders if the answer has changed. Writing it into state from an
 * effect would do the same thing a beat later and one render less honestly.
 *
 * Nothing to subscribe to — the bar outlives every route, so the element is
 * found once and never replaced.
 */
const noChanges = () => () => undefined;
const findSlot = () => document.getElementById(APP_BAR_SLOT_ID);
const nothingOnTheServer = () => null;

export function AppBarPortal({ children }: { readonly children: ReactNode }) {
  const slot = useSyncExternalStore(noChanges, findSlot, nothingOnTheServer);

  /*
   * No bar, no portal — but still the controls.
   *
   * A workspace rendered without the application shell around it is a real
   * arrangement: it is how every integration test mounts one, and it is what a
   * future embedding would look like. Returning nothing would mean the title,
   * Focus, Share and Export vanished whenever the slot was absent, which is a
   * component that only works in one place. So they fall back to where they are
   * written, which is where they used to be.
   */
  return slot === null ? <>{children}</> : createPortal(children, slot);
}
