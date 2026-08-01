/**
 * A stand-in for the Fullscreen API, which jsdom does not implement.
 *
 * Shared by the hook's unit tests and the Focus-mode integration tests so the
 * two cannot disagree about how a browser behaves — the interesting cases are
 * the browsers that answer differently from the one this was written on.
 */

export interface FakeFullscreenApi {
  /** Elements that were asked to go fullscreen, in order. */
  readonly requests: Element[];
  /** The browser leaving fullscreen on its own — Escape, F11, its own button. */
  readonly leaveWithoutAsking: () => void;
  /** Whether the fake currently reports a fullscreen element. */
  readonly isFullscreen: () => boolean;
}

export function installFullscreenApi(
  options: { enabled?: boolean; exit?: boolean; refuse?: boolean } = {},
): FakeFullscreenApi {
  const { enabled = true, exit = true, refuse = false } = options;
  let current: Element | null = null;
  const requests: Element[] = [];

  const change = () => document.dispatchEvent(new Event('fullscreenchange'));

  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => enabled });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: exit
      ? () => {
          current = null;
          change();
          return Promise.resolve();
        }
      : undefined,
  });
  // `this` is passed straight on rather than assigned to a local, which the
  // no-this-alias rule reads as a sign of a function that wanted to be a method.
  const enter = (element: Element) => {
    requests.push(element);
    if (refuse) return Promise.reject(new Error('denied by permissions policy'));
    current = element;
    change();
    return Promise.resolve();
  };

  Object.defineProperty(Element.prototype, 'requestFullscreen', {
    configurable: true,
    value(this: Element) {
      return enter(this);
    },
  });

  return {
    requests,
    isFullscreen: () => current !== null,
    leaveWithoutAsking: () => {
      current = null;
      change();
    },
  };
}

export function removeFullscreenApi(): void {
  for (const name of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']) {
    Reflect.deleteProperty(document, name);
  }
  Reflect.deleteProperty(Element.prototype, 'requestFullscreen');
}
