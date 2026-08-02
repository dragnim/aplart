/**
 * The APL code editor.
 *
 * A thin React wrapper around CodeMirror 6. CodeMirror owns the document while
 * it is mounted; this component only pushes changes in when the value has been
 * altered from outside — by a slider, Randomise or Reset — and never while the
 * user is typing, which would fight the cursor.
 */

import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
} from '@codemirror/view';
import { useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import { aplLanguageSupport } from './aplLanguage';
import styles from './AplEditor.module.css';

export interface AplEditorHandle {
  /** Inserts text at the cursor and keeps focus, for the symbol toolbar. */
  insertAtCursor: (text: string) => void;
  focus: () => void;
  undo: () => void;
  redo: () => void;
}

interface Props {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Ctrl+Enter and Cmd+Enter, wherever the cursor is. */
  readonly onRun: () => void;
  readonly ariaLabel: string;
  readonly handleRef?: RefObject<AplEditorHandle | null>;
}

const editorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--surface-dark)',
      color: 'var(--text-on-dark)',
      fontSize: '15px',
      height: '100%',
    },
    '.cm-content': {
      fontFamily: 'var(--font-apl)',
      padding: '12px 0',
      caretColor: 'var(--accent-orange)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--surface-dark)',
      color: '#6b7280',
      border: 'none',
      borderRight: '1px solid var(--border-dark)',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.04)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255, 255, 255, 0.04)', color: '#9aa3af' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent-orange)', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(255, 106, 19, 0.28)',
    },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: 'rgba(127, 210, 255, 0.22)',
      outline: '1px solid rgba(127, 210, 255, 0.5)',
    },
    '.cm-selectionMatch': { backgroundColor: 'rgba(255, 255, 255, 0.09)' },
    '.cm-panels': { backgroundColor: 'var(--surface-dark-raised)', color: 'var(--text-on-dark)' },
    '.cm-searchMatch': { backgroundColor: 'rgba(255, 196, 140, 0.3)' },
    // The default focus ring is drawn by the browser on the scroller, which
    // clips it; a visible ring on the wrapper is required for keyboard users.
    '&.cm-focused': { outline: '3px solid var(--focus)', outlineOffset: '2px' },
  },
  { dark: true },
);

export function AplEditor({ value, onChange, onRun, ariaLabel, handleRef }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // Held in refs so the extensions, which are created once, always call the
  // latest handlers without the editor having to be rebuilt. Updated after
  // render rather than during it, which React forbids.
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  useEffect(() => {
    onChangeRef.current = onChange;
    onRunRef.current = onRun;
  });

  useEffect(() => {
    if (container.current === null) return;

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      search({ top: true }),
      highlightSelectionMatches(),
      aplLanguageSupport(),
      EditorView.lineWrapping,
      editorTheme,
      placeholderExtension('Write some APL that returns a grid of numbers…'),
      keymap.of([
        {
          key: 'Mod-Enter',
          preventDefault: true,
          run: () => {
            onRunRef.current();
            return true;
          },
        },
        ...searchKeymap,
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
      EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
    ];

    const instance = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: container.current,
    });
    view.current = instance;

    return () => {
      instance.destroy();
      view.current = null;
    };
    // Built once. Value changes are pushed in by the effect below; rebuilding
    // the editor on every keystroke would destroy undo history and the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only touches the document when it genuinely differs, so typing is never
  // interrupted but a slider or Reset still moves the text.
  useEffect(() => {
    const instance = view.current;
    if (instance === null) return;

    const current = instance.state.doc.toString();
    if (current === value) return;

    instance.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      // Keep the cursor where it was if that position still exists.
      selection: { anchor: Math.min(instance.state.selection.main.anchor, value.length) },
    });
  }, [value]);

  useImperativeHandle(
    handleRef,
    (): AplEditorHandle => ({
      insertAtCursor: (text: string) => {
        const instance = view.current;
        if (instance === null) return;
        const { from, to } = instance.state.selection.main;
        instance.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
          scrollIntoView: true,
        });
        instance.focus();
      },
      focus: () => view.current?.focus(),
      undo: () => {
        const instance = view.current;
        if (instance !== null) undo(instance);
      },
      redo: () => {
        const instance = view.current;
        if (instance !== null) redo(instance);
      },
    }),
    [],
  );

  return <div className={styles.editor} ref={container} />;
}
