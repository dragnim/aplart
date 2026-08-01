import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Browser fullscreen, as a layer on top of Focus mode rather than a
 * replacement for it.
 *
 * Focus mode already gives the artwork the whole window; this only removes the
 * browser's own chrome from around it. That is why an absent Fullscreen API is
 * not an error state and needs no apology: Focus mode is the fallback, and it
 * is most of the benefit.
 *
 * Returns `null` when the browser will not do it at all — an iPhone, or a
 * frame embedded without `allow="fullscreen"` — so callers offer nothing
 * rather than a button that cannot work.
 */
export interface Fullscreen {
  readonly active: boolean;
  /** A refused request, for a brief message. Clears itself. */
  readonly error: string | null;
  readonly toggle: () => void;
  readonly exit: () => void;
}

/**
 * Whether anything is currently fullscreen.
 *
 * Not inlined as `document.fullscreenElement !== null`, which is how the
 * property is typed but not how it behaves: where the API is missing it is
 * `undefined`, and that comparison then reports fullscreen everywhere it is
 * unsupported — exactly backwards.
 */
export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && Boolean(document.fullscreenElement);
}

function browserAllowsFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  /*
   * `fullscreenEnabled` answers both questions worth asking: whether the API
   * exists, and whether this document is permitted to use it. A frame without
   * the permission reports false here, which is the case a feature check on
   * `requestFullscreen` alone would miss.
   */
  return document.fullscreenEnabled === true && typeof document.exitFullscreen === 'function';
}

export function useFullscreen(target: RefObject<HTMLElement | null>): Fullscreen | null {
  const [supported] = useState(browserAllowsFullscreen);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * The state is read from the browser, never assumed from our own calls.
   * Fullscreen can be left by Escape and by the browser's own fullscreen
   * controls, neither of which passes through this code — a flag we maintained
   * ourselves would be wrong within one keystroke.
   *
   * F11 is a separate thing and deliberately not listed: it is the browser's
   * own window fullscreen, outside the Fullscreen API, and normally does not
   * touch `fullscreenElement` at all. Reading the browser's state rather than
   * tracking our own means we neither claim it does nor need to care.
   */
  useEffect(() => {
    if (!supported) return;

    const sync = () => {
      setActive(isFullscreen());
      setError(null);
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [supported]);

  useEffect(() => {
    if (error === null) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const exit = useCallback(() => {
    if (!supported || !isFullscreen()) return;
    void document.exitFullscreen().catch(() => undefined);
  }, [supported]);

  const request = useCallback(() => {
    const element = target.current;
    if (!supported || element === null) return;

    void element.requestFullscreen().catch(() => {
      // Refusals are the browser's to make — a permissions policy, or a
      // gesture it did not consider a gesture. Say so and change nothing else.
      setError('Your browser would not allow fullscreen. Focus mode still fills the window.');
    });
  }, [supported, target]);

  const toggle = useCallback(() => {
    if (active) exit();
    else request();
  }, [active, exit, request]);

  if (!supported) return null;
  return { active, error, toggle, exit };
}
