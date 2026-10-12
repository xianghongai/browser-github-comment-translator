/**
 * 把渲染后的评论正文切成可翻译的文本段，并在翻译后把译文写回同样的 DOM 结构。
 *
 * 段内的行内元素用占位符保护：
 * - 原子占位符 `⟦n⟧`：代码、@ 提及、issue 引用、图片、换行等，原样保留不翻译；
 * - 成对占位符 `⟦n⟧…⟦/n⟧`：加粗、斜体、普通链接等，保留标签，只翻译里面的文字。
 *
 * 写回时只创建 TextNode 和原节点的克隆，从不使用 innerHTML，译文里的任何标记都按纯文本处理。
 */

export interface Segment {
  /** 送去翻译的文本，已折叠空白。 */
  text: string;
  /** 这一段在 DOM 中占据的连续子节点，写回时整体替换。 */
  nodes: ChildNode[];
  /** 占位符编号对应的原节点。 */
  tokens: Token[];
}

interface Token {
  node: Element;
  paired: boolean;
}

/** 内容整体不翻译的元素：代码块、建议修改、媒体等。 */
const SKIP_SELECTOR = [
  'pre',
  '.highlight',
  '.js-suggested-changes-blob',
  '.blob-wrapper',
  'math-renderer',
  'svg',
  'video',
  'script',
  'style',
  'template',
].join(',');

/** 块级元素会打断一段文本；它们内部的文字各自成段。 */
const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DETAILS',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'SUMMARY',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL',
]);

/** 保留标签、翻译内部文字的行内元素。 */
const PAIRED_TAGS = new Set([
  'A',
  'ABBR',
  'B',
  'DEL',
  'EM',
  'I',
  'INS',
  'MARK',
  'S',
  'SMALL',
  'SPAN',
  'STRONG',
  'SUB',
  'SUP',
  'U',
]);

/** 链接文字本身是引用（@user、#123、commit SHA 等）时整体保留，不翻译。 */
const ATOMIC_LINK_SELECTOR = '.user-mention, .team-mention, .issue-link, .commit-link, [data-hovercard-type]';

const PLACEHOLDER_PATTERN = /⟦\s*(\/?)\s*(\d+)\s*⟧/g;
const LETTER_PATTERN = /\p{L}/u;

/** 收集 root 内所有可翻译的文本段；root 本身不会被修改。 */
export function collectSegments(root: Element): Segment[] {
  const segments: Segment[] = [];
  walk(root, segments);
  return segments;
}

function walk(element: Element, segments: Segment[]): void {
  let run: ChildNode[] = [];
  const flush = () => {
    const segment = buildSegment(run);
    if (segment) {
      segments.push(segment);
    }
    run = [];
  };

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      run.push(child);
      continue;
    }
    if (!(child instanceof Element)) {
      continue;
    }
    if (child.matches(SKIP_SELECTOR)) {
      flush();
      continue;
    }
    if (isBlock(child)) {
      flush();
      walk(child, segments);
      continue;
    }
    run.push(child);
  }
  flush();
}

function isBlock(element: Element): boolean {
  if (BLOCK_TAGS.has(element.tagName)) {
    return true;
  }
  // 自定义元素（<markdown-accessiblity-table> 等）或行内元素里嵌了块级元素时，按块处理，
  // 以免整张表格、整段内容变成一个不翻译的占位符。
  return Array.from(element.children).some((child) => isBlock(child));
}

function buildSegment(nodes: ChildNode[]): Segment | null {
  const tokens: Token[] = [];
  const text = nodes
    .map((node) => serialize(node, tokens))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  // 只有占位符、数字或符号的段（比如单独一行链接）没有可翻译的内容。
  if (!LETTER_PATTERN.test(text.replace(PLACEHOLDER_PATTERN, ''))) {
    return null;
  }
  return { text, nodes, tokens };
}

function serialize(node: ChildNode, tokens: Token[]): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }
  if (!(node instanceof Element)) {
    return '';
  }
  const index = tokens.length;
  if (isPaired(node)) {
    tokens.push({ node, paired: true });
    const inner = Array.from(node.childNodes)
      .map((child) => serialize(child, tokens))
      .join('');
    return `⟦${index}⟧${inner}⟦/${index}⟧`;
  }
  tokens.push({ node, paired: false });
  return `⟦${index}⟧`;
}

function isPaired(element: Element): boolean {
  if (!PAIRED_TAGS.has(element.tagName)) {
    return false;
  }
  if (element.tagName === 'A') {
    return !element.matches(ATOMIC_LINK_SELECTOR) && !looksLikeUrl(element.textContent ?? '');
  }
  return true;
}

function looksLikeUrl(text: string): boolean {
  return /^\s*https?:\/\/\S+\s*$/.test(text);
}

/**
 * 把译文写回 segment 原来的位置。
 *
 * 模型偶尔会丢掉或打乱占位符：未闭合的成对占位符自动闭合，多余的闭合占位符忽略，
 * 丢失的原子占位符追加到段尾，确保代码、链接、提及不会凭空消失。
 */
export function applyTranslation(segment: Segment, translation: string): void {
  const [first] = segment.nodes;
  if (!first?.parentNode) {
    return;
  }
  const fragment = renderTranslation(segment.tokens, translation, first.ownerDocument ?? document);
  first.parentNode.insertBefore(fragment, first);
  for (const node of segment.nodes) {
    node.remove();
  }
}

export function renderTranslation(tokens: readonly Token[], translation: string, doc: Document): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  const stack: { node: ParentNode; index: number }[] = [{ node: fragment, index: -1 }];
  const used = new Set<number>();
  const top = () => stack[stack.length - 1].node;

  let cursor = 0;
  for (const match of translation.matchAll(PLACEHOLDER_PATTERN)) {
    appendText(top(), translation.slice(cursor, match.index), doc);
    cursor = match.index + match[0].length;

    const isClosing = match[1] === '/';
    const index = Number(match[2]);
    const token = tokens[index];
    if (!token) {
      appendText(top(), match[0], doc);
      continue;
    }
    if (isClosing) {
      const position = stack.findLastIndex((entry) => entry.index === index);
      if (position > 0) {
        stack.length = position;
      }
      continue;
    }
    if (used.has(index)) {
      // 同一占位符重复出现时只渲染一次，避免链接、代码被复制。
      continue;
    }
    used.add(index);
    if (token.paired) {
      const shell = token.node.cloneNode(false) as Element;
      top().append(shell);
      stack.push({ node: shell, index });
    } else {
      top().append(token.node.cloneNode(true));
    }
  }
  appendText(top(), translation.slice(cursor), doc);

  tokens.forEach((token, index) => {
    if (!token.paired && !used.has(index)) {
      fragment.append(doc.createTextNode(' '), token.node.cloneNode(true));
    }
  });
  return fragment;
}

function appendText(parent: ParentNode, text: string, doc: Document): void {
  if (text) {
    parent.append(doc.createTextNode(text));
  }
}
