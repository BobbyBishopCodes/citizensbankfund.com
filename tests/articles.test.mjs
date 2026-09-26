import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseArticle, sortArticles } from '../src/lib/article-files.ts';

const source = (extra = '', body = 'Article body.') => `---\ntitle: "Market update"\ncategory: "Research"\nsummary: "A summary."\nimage: "/assets/site/campus.webp"\nimageAlt: "Campus"\n${extra}---\n\n${body}`;

test('filename defines the URL; metadata and Markdown are retained', () => {
  const article = parseArticle('market-update.md', source('date: "2026-09-24"\nauthor: "The team"\nfeatured: true\n', '## Research\n\n**Findings**'));
  assert.equal(article.id, 'market-update');
  assert.equal(article.date, '2026-09-24');
  assert.equal(article.author, 'The team');
  assert.equal(article.featured, true);
  assert.equal(article.preview, false);
  assert.match(article.body, /## Research/);
});

test('drafts and templates are excluded, including their body content', () => {
  assert.equal(parseArticle('_template.md', 'Incomplete template'), null);
  assert.equal(parseArticle('draft.md', '---\ndraft: true\n---\nPrivate body'), null);
});

test('invalid published files report their filenames and fields', () => {
  assert.throws(() => parseArticle('bad.md', 'No metadata'), /bad.md: Start/);
  assert.throws(() => parseArticle('bad.md', source().replace('title: "Market update"', 'title: ""')), /bad.md: Missing or empty title/);
  assert.throws(() => parseArticle('Bad Name.md', source()), /lowercase/);
  assert.throws(() => parseArticle('bad.md', source('draft: "false"\n')), /draft must be true or false/);
  assert.throws(() => parseArticle('bad.md', source('date: "2026-02-30"\n')), /valid YYYY-MM-DD/);
  assert.throws(() => parseArticle('bad.md', source('', '')), /Add Markdown/);
  assert.throws(() => parseArticle('bad.md', source('title: "Duplicate"\n')), /Invalid metadata/);
});

test('cover image URLs cannot use executable or protocol-relative schemes', () => {
  for (const image of ['javascript:alert(1)', '//example.com/cover.jpg', 'data:image/svg+xml,test']) {
    assert.throws(() => parseArticle('bad.md', source().replace('/assets/site/campus.webp', image)), /image must be/);
  }
});

test('newest articles sort first, with stable ordering for undated previews', () => {
  const dated = parseArticle('new.md', source('date: "2026-09-24"\n'));
  const old = parseArticle('old.md', source('date: "2025-01-01"\n'));
  const first = parseArticle('first.md', source('order: 1\n'));
  const second = parseArticle('second.md', source('order: 2\n'));
  assert.deepEqual(sortArticles([second, old, first, dated]).map(article => article.id), ['new', 'old', 'first', 'second']);
});

test('Windows line endings and UTF-8 BOM are accepted', () => {
  assert.equal(parseArticle('windows.md', '\uFEFF' + source().replaceAll('\n', '\r\n')).title, 'Market update');
});

test('Markdown supports tables and removes raw HTML and executable links', () => {
  const body = '## Research\n\n| Metric | Value |\n| --- | --- |\n| Test | 10 |\n\n<script>alert(1)</script>\n\n[Unsafe](javascript:alert%281%29)';
  const html = renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm], skipHtml: true }, body));
  assert.match(html, /<h2>Research<\/h2>/);
  assert.match(html, /<table>/);
  assert.doesNotMatch(html, /<script|javascript:/);
});
