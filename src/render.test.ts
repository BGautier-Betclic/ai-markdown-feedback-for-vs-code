import { test } from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { commentPlugin, highlightPlugin, deletionPlugin, sourceMapPlugin } from './plugins';
import { getWebviewContent } from './webview/template';

function render(source: string): string {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
  md.enable('strikethrough');
  md.use(highlightPlugin);
  md.use(commentPlugin);
  md.use(deletionPlugin);
  md.use(sourceMapPlugin);
  return md.render(source);
}

// The hover action bar reads these attributes to locate the annotation in the
// source, so a rendering change that drops them silently breaks edit/delete.

test('a comment carries the source span covering its %% markers', () => {
  const html = render('Kafka here. %%too vague%%');
  const pos = /data-source-pos="(\d+):(\d+)"[^>]*>\s*<span class="ace-comment-icon"/.exec(html)
    ?? /class="ace-comment[^"]*"[^>]*data-source-pos="(\d+):(\d+)"/.exec(html);
  assert.ok(pos, `no source position on the comment: ${html}`);
  const [, start, end] = pos!;
  // "%%too vague%%" is 13 characters wide.
  assert.equal(Number(end) - Number(start), 13);
});

test('a quick reply renders its emoji as the icon and gets its own class', () => {
  const html = render('Kafka here. %%✅ yes%%');
  assert.match(html, /class="ace-comment ace-comment--quick"/);
  assert.match(html, /<span class="ace-comment-icon">✅<\/span>/);
  // data-comment keeps the full text — it is what identifies the annotation.
  assert.match(html, /data-comment="✅ yes"/);
});

test('a plain comment keeps the generic icon', () => {
  const html = render('Kafka here. %%too vague%%');
  assert.match(html, /<span class="ace-comment-icon">💬<\/span>/);
  assert.doesNotMatch(html, /ace-comment--quick/);
});

test('highlights and deletions carry a marker-inclusive raw span', () => {
  const html = render('Read ==the important part== now.\n\nDrop ~~this clause~~ maybe.');
  assert.match(html, /<mark[^>]*data-source-raw-pos="\d+:\d+"/);
  assert.match(html, /<s[^>]*data-source-raw-pos="\d+:\d+"/);
});

test('the webview exposes the quick notes and the action bar', () => {
  const html = getWebviewContent({
    body: '<p>body</p>',
    highlightColor: '#fff3a0',
    showGutter: true,
    cspSource: 'vscode-resource:',
    nonce: 'deadbeef',
    quickNotes: [{ key: 'y', emoji: '✅', text: 'yes' }],
  });
  assert.match(html, /const QUICK_NOTES = \[\{"key":"y"/);
  assert.match(html, /id="ace-actions"/);
  assert.match(html, /id="ace-quick-legend"[^>]*>y ✅</);
  // Nothing in the injected JSON may close the script element.
  assert.doesNotMatch(html.split('QUICK_NOTES = ')[1].split(';')[0], /<\/script/i);
});
