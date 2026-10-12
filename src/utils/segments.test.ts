// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { applyTranslation, collectSegments } from './segments';

function body(html: string): HTMLElement {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element;
}

function translateAll(root: HTMLElement, translate: (text: string) => string): void {
  for (const segment of collectSegments(root)) {
    applyTranslation(segment, translate(segment.text));
  }
}

describe('collectSegments', () => {
  it('turns block elements into separate segments and collapses whitespace', () => {
    const root = body('<h2>Title</h2><p>First\n  line</p><ul><li>One</li><li>Two</li></ul>');
    expect(collectSegments(root).map(({ text }) => text)).toEqual(['Title', 'First line', 'One', 'Two']);
  });

  it('skips code blocks and segments without letters', () => {
    const root = body(
      '<pre><code>npm install</code></pre><div class="highlight"><pre>x</pre></div><p>123 !</p><p>Ok</p>'
    );
    expect(collectSegments(root).map(({ text }) => text)).toEqual(['Ok']);
  });

  it('protects inline code, mentions and line breaks as atomic placeholders', () => {
    const root = body('<p>Use <code>.agents/</code> like <a class="user-mention" href="/x">@x</a> said<br>ok</p>');
    expect(collectSegments(root)[0].text).toBe('Use ⟦0⟧ like ⟦1⟧ said⟦2⟧ok');
  });

  it('wraps formatting and plain links as paired placeholders', () => {
    const root = body('<p>This is <strong>very <em>important</em></strong>, see <a href="/docs">the docs</a></p>');
    expect(collectSegments(root)[0].text).toBe('This is ⟦0⟧very ⟦1⟧important⟦/1⟧⟦/0⟧, see ⟦2⟧the docs⟦/2⟧');
  });

  it('treats links whose text is a URL as atomic', () => {
    const root = body('<p>See <a href="https://example.com">https://example.com</a> now</p>');
    expect(collectSegments(root)[0].text).toBe('See ⟦0⟧ now');
  });

  it('descends into custom elements that wrap block content', () => {
    const root = body(
      '<markdown-accessiblity-table><table><tr><th>Hook</th></tr><tr><td>Runs once</td></tr></table></markdown-accessiblity-table>'
    );
    expect(collectSegments(root).map(({ text }) => text)).toEqual(['Hook', 'Runs once']);
  });

  it('splits list items that contain nested lists into their own runs', () => {
    const root = body('<ul><li>Parent<ul><li>Child</li></ul></li></ul>');
    expect(collectSegments(root).map(({ text }) => text)).toEqual(['Parent', 'Child']);
  });
});

describe('applyTranslation', () => {
  it('rebuilds inline elements around the translated text', () => {
    const root = body('<p>Use <code>.agents/</code> for <a href="/s">skills</a> discovery.</p>');
    translateAll(root, () => '使用 ⟦0⟧ 来发现⟦1⟧技能⟦/1⟧。');
    expect(root.innerHTML).toBe('<p>使用 <code>.agents/</code> 来发现<a href="/s">技能</a>。</p>');
  });

  it('keeps code blocks untouched', () => {
    const root = body('<p>Hello</p><pre><code>keep me</code></pre>');
    translateAll(root, () => '你好');
    expect(root.innerHTML).toBe('<p>你好</p><pre><code>keep me</code></pre>');
  });

  it('treats markup in the translation as plain text', () => {
    const root = body('<p>Hello</p>');
    translateAll(root, () => '<img src=x onerror=alert(1)>');
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('appends atomic placeholders the translation dropped', () => {
    const root = body('<p>Run <code>make</code> now</p>');
    translateAll(root, () => '现在运行');
    expect(root.innerHTML).toBe('<p>现在运行 <code>make</code></p>');
  });

  it('closes unclosed pairs, ignores stray closers and duplicates', () => {
    const root = body('<p><strong>bold</strong> and <code>x</code></p>');
    translateAll(root, () => '⟦0⟧粗体 和 ⟦1⟧ ⟦1⟧ ⟦/9⟧');
    expect(root.innerHTML).toBe('<p><strong>粗体 和 <code>x</code>  ⟦/9⟧</strong></p>');
  });

  it('tolerates spaces the engine inserts inside placeholders', () => {
    const root = body('<p>A <code>b</code> c</p>');
    translateAll(root, () => 'A ⟦ 0 ⟧ c');
    expect(root.innerHTML).toBe('<p>A <code>b</code> c</p>');
  });
});
