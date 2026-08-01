/**
 * Syntax highlighting for Dyalog APL.
 *
 * A token-level stream parser rather than a grammar. APL's real grammar
 * depends on the values bound to names, which cannot be known without running
 * the code, so a full parser is neither achievable nor needed here: the job is
 * to make comments recede, strings and numbers stand out, and glyphs read as
 * operations.
 */

import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StringStream } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

/** Glyphs that act on data: functions, operators and the assignment arrows. */
const PRIMITIVES = new Set([
  '+',
  '-',
  '×',
  '÷',
  '*',
  '⍟',
  '⌹',
  '○',
  '!',
  '?',
  '|',
  '⌈',
  '⌊',
  '⊥',
  '⊤',
  '⊣',
  '⊢',
  '=',
  '≠',
  '≤',
  '<',
  '>',
  '≥',
  '≡',
  '≢',
  '∨',
  '∧',
  '⍲',
  '⍱',
  '↑',
  '↓',
  '⊂',
  '⊃',
  '⊆',
  '⌷',
  '⍋',
  '⍒',
  '⍳',
  '⍸',
  '∊',
  '⍷',
  '∪',
  '∩',
  '~',
  '/',
  '\\',
  '⌿',
  '⍀',
  ',',
  '⍪',
  '⍴',
  '⌽',
  '⊖',
  '⍉',
  '⍎',
  '⍕',
  '⊆',
  '⌸',
  '⌺',
  '∘',
  '⍤',
  '⍥',
  '⍨',
  '⍣',
  '⍠',
  '⌶',
  '&',
  '@',
  '⌾',
  '⍛',
  '⍢',
]);

const NAME_START = /[A-Za-z_∆⍙]/u;
const NAME_PART = /[A-Za-z0-9_∆⍙]/u;
const DIGIT = /[0-9]/u;

interface AplState {
  /** Set while inside a quoted string that has not been closed. */
  inString: boolean;
}

export const aplStreamLanguage = StreamLanguage.define<AplState>({
  name: 'apl',

  startState: () => ({ inString: false }),

  token(stream, state) {
    if (state.inString) return consumeString(stream, state);

    if (stream.eatSpace()) return null;

    const next = stream.peek();
    if (next === undefined) {
      stream.next();
      return null;
    }

    // A lamp runs to the end of the line.
    if (next === '⍝') {
      stream.skipToEnd();
      return 'comment';
    }

    if (next === "'") {
      stream.next();
      state.inString = true;
      return consumeString(stream, state);
    }

    // Numbers, including the overbar that APL uses for negatives. The overbar
    // only starts a number when a digit or decimal point follows it.
    if (DIGIT.test(next) || (next === '¯' && isNumberAhead(stream))) {
      consumeNumber(stream);
      return 'number';
    }
    if (next === '.' && /[0-9]/u.test(stream.string.charAt(stream.pos + 1))) {
      consumeNumber(stream);
      return 'number';
    }

    // Quad names such as ⎕IO and ⎕DR.
    if (next === '⎕' || next === '⍞') {
      stream.next();
      while (isSet(stream.peek()) && NAME_PART.test(stream.peek() as string)) stream.next();
      return 'keyword';
    }

    // The dfn arguments and self-reference.
    if (next === '⍺' || next === '⍵' || next === '∇') {
      stream.next();
      return 'variableName.special';
    }

    if (next === '←' || next === '→') {
      stream.next();
      return 'definitionOperator';
    }

    if (next === '⋄' || next === '◇') {
      stream.next();
      return 'separator';
    }

    if ('()[]{}'.includes(next)) {
      stream.next();
      return 'bracket';
    }

    if (PRIMITIVES.has(next)) {
      stream.next();
      return 'operator';
    }

    if (NAME_START.test(next)) {
      stream.next();
      while (isSet(stream.peek()) && NAME_PART.test(stream.peek() as string)) stream.next();
      return 'variableName';
    }

    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: '⍝' },
    closeBrackets: { brackets: ['(', '[', '{', "'"] },
  },
});

/** `StringStream.peek` yields undefined at end of line, not null. */
function isSet(character: string | undefined): character is string {
  return character !== undefined;
}

function isNumberAhead(stream: StringStream): boolean {
  return /[0-9.]/u.test(stream.string.charAt(stream.pos + 1));
}

function consumeNumber(stream: StringStream): void {
  stream.next();
  while (isSet(stream.peek()) && /[0-9.]/u.test(stream.peek() as string)) stream.next();

  // An exponent, whose sign may itself be an overbar.
  if (stream.peek() === 'e' || stream.peek() === 'E') {
    stream.next();
    stream.eat(/[¯+-]/u);
    while (isSet(stream.peek()) && DIGIT.test(stream.peek() as string)) stream.next();
  }

  // Complex numbers are not renderable, but they should still look like
  // numbers rather than a number, a name and another number.
  if (stream.peek() === 'j' || stream.peek() === 'J') {
    stream.next();
    stream.eat(/¯/u);
    while (isSet(stream.peek()) && /[0-9.]/u.test(stream.peek() as string)) stream.next();
  }
}

function consumeString(stream: StringStream, state: AplState): string {
  while (isSet(stream.peek())) {
    const character = stream.next();
    if (character === "'") {
      // A doubled quote is an escaped one and the string continues.
      if (stream.peek() === "'") {
        stream.next();
        continue;
      }
      state.inString = false;
      return 'string';
    }
  }

  // Unterminated at end of line. Dyalog does not allow a string to span lines,
  // so the state is cleared rather than bleeding into the next one.
  state.inString = false;
  return 'string';
}

/**
 * Colours for the highlighting tags.
 *
 * Tuned for the dark editor surface. Comments are deliberately low contrast
 * against the code but still meet the 4.5:1 needed to be readable.
 */
export const aplHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: '#8b9199', fontStyle: 'italic' },
  { tag: tags.string, color: '#9ae6a0' },
  { tag: tags.number, color: '#ffc48c' },
  { tag: tags.definitionOperator, color: '#ff8f4d', fontWeight: '700' },
  { tag: tags.operator, color: '#7fd2ff' },
  { tag: tags.keyword, color: '#d7a6ff' },
  { tag: tags.variableName, color: '#eceff4' },
  { tag: tags.special(tags.variableName), color: '#ffd479' },
  { tag: tags.bracket, color: '#c3cbd6' },
  { tag: tags.separator, color: '#c3cbd6' },
]);

export function aplLanguageSupport(): Extension {
  return [aplStreamLanguage, syntaxHighlighting(aplHighlightStyle)];
}
