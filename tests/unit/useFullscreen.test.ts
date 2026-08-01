/**
 * The fullscreen hook.
 *
 * jsdom implements none of the Fullscreen API, which is convenient: the whole
 * point of these tests is what the hook does with a browser that answers
 * differently from the one it was written on — refusing, not offering the API
 * at all, or leaving fullscreen without telling us first.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFullscreen, useFullscreen } from '@/workspace/useFullscreen';
import { installFullscreenApi, removeFullscreenApi } from '../support/fullscreenApi';

afterEach(() => {
  removeFullscreenApi();
  vi.useRealTimers();
});

function mount() {
  const element = document.createElement('div');
  const ref = { current: element };
  const view = renderHook(() => useFullscreen(ref));
  return { ...view, element };
}

describe('isFullscreen', () => {
  it('is false where the API does not exist', () => {
    /*
     * The one that bit. `fullscreenElement` is typed `Element | null` but is
     * `undefined` where the API is absent, so the obvious
     * `document.fullscreenElement !== null` reports fullscreen on every
     * browser that cannot do fullscreen — and the Escape handler that used it
     * stopped unwinding anything at all.
     */
    expect(isFullscreen()).toBe(false);
  });

  it('is false when the API exists but nothing is fullscreen', () => {
    installFullscreenApi();
    expect(isFullscreen()).toBe(false);
  });

  it('is true while something is fullscreen', async () => {
    installFullscreenApi();
    const element = document.createElement('div');
    await element.requestFullscreen();
    expect(isFullscreen()).toBe(true);
  });
});

describe('useFullscreen', () => {
  describe('when the browser will not do it', () => {
    it('offers nothing at all if fullscreen is not enabled for this document', () => {
      installFullscreenApi({ enabled: false });
      // An iframe without allow="fullscreen" reports exactly this.
      expect(mount().result.current).toBeNull();
    });

    it('offers nothing if there is no way back out', () => {
      installFullscreenApi({ exit: false });
      // An iPhone. A button that could be entered but never left is worse
      // than no button.
      expect(mount().result.current).toBeNull();
    });

    it('offers nothing when the API is absent entirely', () => {
      expect(mount().result.current).toBeNull();
    });
  });

  describe('when it is available', () => {
    it('starts inactive and offers a toggle', () => {
      installFullscreenApi();
      const { result } = mount();
      expect(result.current).not.toBeNull();
      expect(result.current?.active).toBe(false);
      expect(result.current?.error).toBeNull();
    });

    it('asks the target element, not the document body', async () => {
      const api = installFullscreenApi();
      const { result, element } = mount();

      await act(async () => {
        result.current?.toggle();
      });

      expect(api.requests).toEqual([element]);
      expect(result.current?.active).toBe(true);
    });

    it('leaves fullscreen when toggled again', async () => {
      installFullscreenApi();
      const { result } = mount();

      await act(async () => {
        result.current?.toggle();
      });
      await act(async () => {
        result.current?.toggle();
      });

      expect(result.current?.active).toBe(false);
    });

    it('notices fullscreen being left without being asked', async () => {
      const api = installFullscreenApi();
      const { result } = mount();

      await act(async () => {
        result.current?.toggle();
      });
      expect(result.current?.active).toBe(true);

      // Escape, or the browser's own fullscreen control. Neither passes
      // through the hook, so a flag it maintained itself would now be wrong.
      act(() => api.leaveWithoutAsking());
      expect(result.current?.active).toBe(false);
    });

    it('does not call exitFullscreen when it is not fullscreen', () => {
      installFullscreenApi();
      const exit = vi.spyOn(document, 'exitFullscreen');
      const { result } = mount();

      result.current?.exit();

      // Calling it rejects in a real browser, which would surface as an
      // unhandled rejection for no reason.
      expect(exit).not.toHaveBeenCalled();
    });
  });

  describe('when the request is refused', () => {
    it('says so and stays out of fullscreen', async () => {
      installFullscreenApi({ refuse: true });
      const { result } = mount();

      await act(async () => {
        result.current?.toggle();
      });

      expect(result.current?.active).toBe(false);
      expect(result.current?.error).toMatch(/Focus mode still fills the window/);
    });

    it('stops saying so after a few seconds', async () => {
      installFullscreenApi({ refuse: true });
      vi.useFakeTimers();
      const { result } = mount();

      await act(async () => {
        result.current?.toggle();
        // Let the rejection settle while the timers are faked.
        await Promise.resolve();
      });
      expect(result.current?.error).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(6000);
      });
      expect(result.current?.error).toBeNull();
    });
  });
});
