import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteMarker,
  formatQuickNote,
  isAnnotatableLanguage,
  parseQuickNote,
  replaceCommentText,
  resolveMarkerRange,
} from './annotations';

// Columns below are 1-based half-open, as source-map.ts emits them.

test('resolves a comment from the mapped columns', () => {
  const line = 'The worker polls every 5 min. %%too vague%% and then stops.';
  const start = line.indexOf('%%') + 1;
  const range = resolveMarkerRange(line, start, start + '%%too vague%%'.length, 'comment', 'too vague');
  assert.deepEqual(range, { start: start - 1, end: start - 1 + 13, content: 'too vague' });
});

test('falls back to a text search when the mapping has drifted', () => {
  const line = 'Some text moved right. %%too vague%%';
  // Columns point at the pre-edit position, which no longer holds the marker.
  const range = resolveMarkerRange(line, 1, 14, 'comment', 'too vague');
  assert.equal(range?.content, 'too vague');
  assert.equal(line.slice(range!.start, range!.end), '%%too vague%%');
});

test('refuses to guess when neither the mapping nor the text matches', () => {
  const line = 'No annotation here at all.';
  assert.equal(resolveMarkerRange(line, 1, 10, 'comment', 'too vague'), null);
});

test('rejects a mapped comment whose content is not the expected one', () => {
  // Two comments on one line; stale columns land on the wrong one and its
  // content does not match, so the text search must find the right one.
  const line = 'a %%first%% b %%second%%';
  const range = resolveMarkerRange(line, 3, 3 + '%%first%%'.length, 'comment', 'second');
  assert.equal(line.slice(range!.start, range!.end), '%%second%%');
});

test('resolves a highlight even when its rendered text differs from source', () => {
  const line = 'Read ==the **bold** part== now.';
  const start = line.indexOf('==') + 1;
  const raw = '==the **bold** part==';
  const range = resolveMarkerRange(line, start, start + raw.length, 'highlight', 'the bold part');
  assert.equal(range?.content, 'the **bold** part');
});

test('deleting a comment absorbs the space before it', () => {
  const line = 'The worker polls every 5 min. %%too vague%% Next sentence.';
  const range = resolveMarkerRange(line, line.indexOf('%%') + 1, line.indexOf('%%') + 14, 'comment', 'too vague')!;
  assert.equal(deleteMarker(line, range, 'comment'), 'The worker polls every 5 min. Next sentence.');
});

test('deleting a comment at end of line absorbs the trailing space instead', () => {
  const line = 'Kafka here. %%oui%%';
  const range = resolveMarkerRange(line, line.indexOf('%%') + 1, line.length + 1, 'comment', 'oui')!;
  assert.equal(deleteMarker(line, range, 'comment'), 'Kafka here.');
});

test('deleting a highlight unwraps it and keeps the text', () => {
  const line = 'Read ==the important part== now.';
  const start = line.indexOf('==') + 1;
  const range = resolveMarkerRange(line, start, start + '==the important part=='.length, 'highlight', 'the important part')!;
  assert.equal(deleteMarker(line, range, 'highlight'), 'Read the important part now.');
});

test('deleting a strikethrough unwraps it and keeps the text', () => {
  const line = 'Drop ~~this clause~~ maybe.';
  const start = line.indexOf('~~') + 1;
  const range = resolveMarkerRange(line, start, start + '~~this clause~~'.length, 'strike', 'this clause')!;
  assert.equal(deleteMarker(line, range, 'strike'), 'Drop this clause maybe.');
});

test('replacing a comment keeps its position', () => {
  const line = 'Kafka here. %%oui%% Rest of line.';
  const range = resolveMarkerRange(line, line.indexOf('%%') + 1, line.indexOf('%%') + 8, 'comment', 'oui')!;
  assert.equal(replaceCommentText(line, range, '❌ non'), 'Kafka here. %%❌ non%% Rest of line.');
});

test('formats a quick note, tolerating a missing emoji or text', () => {
  assert.equal(formatQuickNote('✅', 'oui'), '%%✅ oui%%');
  assert.equal(formatQuickNote('', 'oui'), '%%oui%%');
  assert.equal(formatQuickNote('✅', ''), '%%✅%%');
});

test('recognises a quick note by its leading emoji', () => {
  assert.deepEqual(parseQuickNote('✅ oui'), { emoji: '✅', text: 'oui' });
  assert.deepEqual(parseQuickNote('🔁 reformule plus clairement'), {
    emoji: '🔁',
    text: 'reformule plus clairement',
  });
  assert.equal(parseQuickNote('this is a normal comment'), null);
});

test('treats skill buffers as annotatable', () => {
  assert.equal(isAnnotatableLanguage('markdown'), true);
  assert.equal(isAnnotatableLanguage('skill'), true);
  assert.equal(isAnnotatableLanguage('typescript'), false);
});
