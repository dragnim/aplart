import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/*
 * The same null jsdom already returns, without the diagnostic.
 *
 * jsdom has no canvas: `getContext` returns null and writes a paragraph about
 * the `canvas` npm package every time, hundreds of lines in a full run. This
 * suppresses the message and nothing else — every caller in the application
 * already handles null, and takes exactly the path it took before.
 *
 * Deliberately not a stub context. A fake that answered would let a test believe
 * pixels had been drawn when none had; the drawing is covered in a real browser.
 */
HTMLCanvasElement.prototype.getContext = () => null;

afterEach(() => {
  cleanup();
});
