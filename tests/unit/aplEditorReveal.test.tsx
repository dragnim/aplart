/**
 * Revealing a line, at the editor's own boundary.
 *
 * Where the selection ends up is asserted through the handle rather than by
 * reaching into CodeMirror: after a reveal, inserting text replaces exactly what
 * is selected, so what comes back says precisely which characters were chosen. A
 * test that asked the view for its selection would be asking the same object that
 * was just told what to do.
 *
 * The rest of what matters here is what the reveal must *not* do — change the
 * document — which is checked the same way: by watching what the editor reports.
 */

import { render } from '@testing-library/react';
import { createRef } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AplEditor, type AplEditorHandle } from '@/editor/AplEditor';

const DOC = ['⍝ Controls', 'size←64', 'modulus←17', 'multiplier←1'].join('\n');

beforeAll(() => {
  // CodeMirror measures text, and jsdom has no layout to measure.
  const nothing = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => nothing;
});

function mountEditor(value = DOC) {
  const handleRef = createRef<AplEditorHandle>();
  const changes: string[] = [];

  render(
    <AplEditor
      value={value}
      onChange={(next) => changes.push(next)}
      onRun={() => undefined}
      ariaLabel="APL code for a test"
      handleRef={handleRef}
    />,
  );

  return { handle: handleRef.current as AplEditorHandle, changes };
}

describe('revealLine', () => {
  it('selects the columns it is given, on the line it is given', () => {
    const { handle, changes } = mountEditor();

    // `modulus←17` is line 2 counting from zero, and its value starts at column 8.
    handle.revealLine(2, { select: { from: 8, to: 10 } });
    handle.insertAtCursor('99');

    expect(changes.at(-1)).toBe(['⍝ Controls', 'size←64', 'modulus←99', 'multiplier←1'].join('\n'));
  });

  it('leaves a caret rather than a selection when given no columns', () => {
    const { handle, changes } = mountEditor();

    handle.revealLine(1);
    handle.insertAtCursor('⍝');

    // Inserted at the start of the line, replacing nothing.
    expect(changes.at(-1)).toBe(['⍝ Controls', '⍝size←64', 'modulus←17', 'multiplier←1'].join('\n'));
  });

  it('changes nothing by itself', () => {
    /*
     * The property the whole feature rests on. A reveal that edited the document
     * would mark the artwork as edited, invalidate the Play history and leave a
     * program nobody wrote.
     */
    const { handle, changes } = mountEditor();

    handle.revealLine(2, { select: { from: 8, to: 10 } });
    handle.revealLine(0);
    handle.revealLine(3, { select: { from: 0, to: 4 } });

    expect(changes).toEqual([]);
  });

  it('takes focus, so the caret is where the eye was sent', () => {
    const { handle } = mountEditor();

    handle.revealLine(2, { select: { from: 8, to: 10 } });

    expect(document.activeElement?.className).toContain('cm-content');
  });

  it('ignores a line the document does not have', () => {
    // Rather than clamping to the nearest one: a line out of range means the
    // caller and the editor disagree about the source, and the nearest line would
    // be the wrong line shown confidently.
    const { handle, changes } = mountEditor();

    handle.revealLine(2, { select: { from: 8, to: 10 } });
    handle.revealLine(99, { select: { from: 0, to: 3 } });
    handle.insertAtCursor('99');

    // Still the selection made by the reveal that was in range.
    expect(changes.at(-1)).toBe(['⍝ Controls', 'size←64', 'modulus←99', 'multiplier←1'].join('\n'));
  });

  it('clamps a column that runs past the end of its line', () => {
    // A stale column from an older source must not select into the line below.
    const { handle, changes } = mountEditor();

    handle.revealLine(1, { select: { from: 5, to: 400 } });
    handle.insertAtCursor('8');

    expect(changes.at(-1)).toBe(['⍝ Controls', 'size←8', 'modulus←17', 'multiplier←1'].join('\n'));
  });

  it('is a no-op before the editor exists', () => {
    const handleRef = createRef<AplEditorHandle>();

    expect(() => handleRef.current?.revealLine(0)).not.toThrow();
  });
});

describe('the reveal and the existing handle', () => {
  it('does not disturb undo, which is the editor’s own', () => {
    const { handle, changes } = mountEditor();

    handle.insertAtCursor('⍝');
    handle.revealLine(2, { select: { from: 8, to: 10 } });
    handle.undo();

    // Back to the document as it was, so the reveal added nothing to undo through.
    expect(changes.at(-1)).toBe(DOC);
  });
});

/** Kept honest: the mock above must not be masking a broken editor. */
it('mounts an editor that reports real edits', () => {
  const { handle, changes } = mountEditor();
  handle.insertAtCursor('x');

  expect(changes).toHaveLength(1);
  expect(vi.isMockFunction(handle.revealLine)).toBe(false);
});
