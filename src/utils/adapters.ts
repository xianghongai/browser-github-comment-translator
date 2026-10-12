/**
 * GitHub 同时存在两套评论 DOM：
 * - React 版 Issue 页（data-testid 稳定，class 名带 CSS Modules 哈希，只能用前缀匹配）；
 * - Rails 经典版 PR Conversation / Files changed 页与 Discussions 页（.timeline-comment / .review-comment）。
 * 每个适配器把一条评论归一成：按钮插在哪里、正文在哪里。
 */
export interface CommentTarget {
  /** 评论在页面内的稳定标识；元素被重新挂载后仍然相同。 */
  key: string;
  /** 一条评论的根元素。 */
  container: Element;
  /** 翻译按钮插到这个元素之前。 */
  anchor: Element;
  /** 渲染后的 Markdown 正文。 */
  body: HTMLElement;
}

export const UI_CLASS = 'gct-actions';
export const TRANSLATION_CLASS = 'gct-translation';

interface Adapter {
  find(root: ParentNode): CommentTarget[];
}

/** React 版 Issue 的评论：按钮放在右上角 ⋯ 菜单按钮之前。 */
const reactIssueComment: Adapter = {
  find(root) {
    return Array.from(root.querySelectorAll('[data-testid^="comment-viewer-outer-box-"]')).flatMap((container) => {
      const anchor = container.querySelector('[data-testid="comment-header-hamburger"]');
      const body = firstMarkdownBody(container, '[data-testid="markdown-body"]');
      const key = container.getAttribute('data-testid')!;
      return anchor && body ? [{ key, container, anchor, body }] : [];
    });
  },
};

/** React 版 Issue 的首楼：标题栏里的 ⋯ 菜单按钮位于 actionsSection 中。 */
const reactIssueBody: Adapter = {
  find(root) {
    return Array.from(root.querySelectorAll('[data-testid="issue-body"]')).flatMap((container) => {
      const anchor = container.querySelector('[class*="IssueBodyHeader-module__actionsSection"] > button:last-of-type');
      const body = firstMarkdownBody(container, '[data-testid="markdown-body"]');
      return anchor && body ? [{ key: 'issue-body', container, anchor, body }] : [];
    });
  },
};

/**
 * 经典版 PR 时间线、代码评审评论与 Discussions：按钮放在 .timeline-comment-actions 的最前面。
 * Discussions 的 ⋯ 菜单包在 .d-flex 行里，按钮要插进这一行，否则会单独占一行。
 */
const classicComment: Adapter = {
  find(root) {
    return Array.from(root.querySelectorAll('.timeline-comment, .review-comment')).flatMap((container) => {
      if (container.closest('.timeline-new-comment, #issuecomment-new')) {
        return [];
      }
      const actions = container.querySelector('.timeline-comment-actions');
      const anchor =
        actions?.querySelector(':scope > .d-flex > comment-actions-container') ?? actions?.firstElementChild;
      const body = firstMarkdownBody(container, '.comment-body.markdown-body:not(.js-preview-body)');
      return anchor && body ? [{ key: classicKey(container), container, anchor, body }] : [];
    });
  },
};

const ADAPTERS = [reactIssueBody, reactIssueComment, classicComment];

export function findCommentTargets(root: ParentNode = document): CommentTarget[] {
  const seen = new Set<Element>();
  return ADAPTERS.flatMap((adapter) => adapter.find(root)).filter(({ body }) => {
    if (seen.has(body)) {
      return false;
    }
    seen.add(body);
    return true;
  });
}

/** 经典版评论的锚点 id（issuecomment-1、discussion_r2、discussioncomment-3 …）；找不到时给元素分配一个一次性的 key。 */
function classicKey(container: Element): string {
  const anchored = container.closest(
    '[id^="issuecomment-"], [id^="pullrequest-"], [id^="discussion_r"], [id^="discussioncomment-"], [id^="issue-"]'
  );
  if (anchored) {
    return anchored.id;
  }
  const element = container as HTMLElement;
  element.dataset.gctKey ??= `gct-${Math.random().toString(36).slice(2)}`;
  return element.dataset.gctKey;
}

/** 取评论里最外层的正文：排除嵌套的 .markdown-body、引用的其它评论、编辑表单的预览和我们自己的译文块。 */
function firstMarkdownBody(container: Element, selector: string): HTMLElement | null {
  for (const candidate of Array.from(container.querySelectorAll<HTMLElement>(selector))) {
    if (candidate.closest(`.${TRANSLATION_CLASS}, .js-comment-update, form`)) {
      continue;
    }
    const outer = candidate.parentElement?.closest(selector);
    if (outer && container.contains(outer)) {
      continue;
    }
    return candidate;
  }
  return null;
}
