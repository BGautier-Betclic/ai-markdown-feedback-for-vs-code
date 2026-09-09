/**
 * Pure annotation helpers — no `vscode` import, so this module is testable
 * with plain `node --test`.
 *
 * Column convention matches what `plugins/source-map.ts` emits: 1-based,
 * half-open ranges `[startColumn, endColumn)` over a single source line.
 */

/** Language ids whose buffers Ace treats as annotatable Markdown. */
const ANNOTATABLE_LANGUAGES = ['markdown', 'skill'];

export function isAnnotatableLanguage(languageId: string): boolean {
  return ANNOTATABLE_LANGUAGES.includes(languageId);
}

export type MarkerKind = 'comment' | 'highlight' | 'strike';

const MARKERS: Record<MarkerKind, string> = {
  comment: '%%',
  highlight: '==',
  strike: '~~',
};

export interface MarkerRange {
  /** 0-based offset of the marker's first character within the line. */
  start: number;
  /** 0-based offset just past the marker's last character. */
  end: number;
  /** Text between the markers. */
  content: string;
}

function unwrap(slice: string, marker: string): string | null {
  if (slice.length < marker.length * 2 + 1) { return null; }
  if (!slice.startsWith(marker) || !slice.endsWith(marker)) { return null; }
  return slice.slice(marker.length, slice.length - marker.length);
}

/**
 * Locate the annotation the preview points at, and prove it is really there.
 *
 * The webview's columns come from a render of a document that may have moved
 * since. So the mapped slice is verified to be a `marker…marker` pair; if it
 * is not, we search the line for the annotation's known text; if that misses
 * too, we give up rather than edit the wrong span.
 */
export function resolveMarkerRange(
  lineText: string,
  startColumn: number,
  endColumn: number,
  kind: MarkerKind,
  oldText: string,
): MarkerRange | null {
  const marker = MARKERS[kind];
  const start = Math.max(0, startColumn - 1);
  const end = Math.min(lineText.length, endColumn - 1);

  if (end > start) {
    const content = unwrap(lineText.slice(start, end), marker);
    // An exact content match confirms the mapping. Highlights and deletions
    // can carry nested inline markup, so their rendered text is allowed to
    // differ from the source; a comment's content is raw text and must match.
    if (content !== null && (kind !== 'comment' || !oldText || content === oldText)) {
      return { start, end, content };
    }
  }

  if (oldText) {
    const needle = marker + oldText + marker;
    const idx = lineText.indexOf(needle);
    if (idx >= 0) {
      return { start: idx, end: idx + needle.length, content: oldText };
    }
  }

  return null;
}

/**
 * Remove an annotation from a line.
 *
 * Comments disappear entirely, absorbing one adjacent space so the words
 * around them do not end up doubly spaced — the same shape as the
 * ` ?%%…%% ?` pattern `clearAllAnnotations` uses. Highlights and deletions
 * are unwrapped instead: the marked text stays, the markers go.
 */
export function deleteMarker(lineText: string, range: MarkerRange, kind: MarkerKind): string {
  if (kind !== 'comment') {
    return lineText.slice(0, range.start) + range.content + lineText.slice(range.end);
  }

  let start = range.start;
  let end = range.end;
  if (lineText[start - 1] === ' ') {
    start -= 1;
  } else if (lineText[end] === ' ') {
    end += 1;
  }
  return lineText.slice(0, start) + lineText.slice(end);
}

/** Replace a comment's text, keeping its position and markers. */
export function replaceCommentText(lineText: string, range: MarkerRange, newText: string): string {
  return lineText.slice(0, range.start) + `%%${newText}%%` + lineText.slice(range.end);
}

/** Render a quick reply as comment source: `%%✅ yes%%`. */
export function formatQuickNote(emoji: string, text: string): string {
  const body = [emoji, text].filter((part) => part && part.trim().length > 0).join(' ').trim();
  return `%%${body}%%`;
}

/**
 * A comment whose text opens with an emoji is a quick reply — the emoji is
 * the verdict. Detected generically so the preview does not need the
 * `acemd.quickNotes` setting plumbed into the markdown-it layer.
 */
const LEADING_EMOJI = /^(\p{Extended_Pictographic}️?)(?:\s+(.*))?$/u;

export function parseQuickNote(content: string): { emoji: string; text: string } | null {
  const match = LEADING_EMOJI.exec(content.trim());
  if (!match) { return null; }
  return { emoji: match[1], text: (match[2] ?? '').trim() };
}
