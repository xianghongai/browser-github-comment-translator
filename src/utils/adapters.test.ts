// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { findCommentTargets } from './adapters';

// 精简自 github.com/anthropics/claude-code/issues/16345（React 版）与 pull/99540（经典版）的真实结构。
const REACT_ISSUE = `
<div data-testid="issue-viewer-issue-container">
  <div data-testid="issue-body">
    <div class="IssueBodyHeader-module__actionsSection__gnoaX"><button id="issue-menu"></button></div>
    <div data-testid="issue-body-viewer">
      <div data-testid="markdown-body" id="issue-md">
        <div class="markdown-body NewMarkdownViewer-module__safe-html-box__ZT1eD"><p>Issue body</p></div>
      </div>
    </div>
  </div>
  <div data-testid="comment-viewer-outer-box-IC_1">
    <div data-testid="comment-header">
      <div data-testid="comment-header-right-side-items">
        <div class="ActivityHeader-module__BadgesContainer__iimDP">
          <button data-testid="comment-header-hamburger" id="comment-menu"></button>
        </div>
      </div>
    </div>
    <div data-testid="markdown-body" id="comment-md"><p>Comment</p></div>
  </div>
</div>`;

const CLASSIC_PR = `
<div id="issuecomment-42"><div class="timeline-comment">
  <div class="timeline-comment-header">
    <div class="timeline-comment-actions"><details id="pr-menu"></details></div>
  </div>
  <task-lists><div class="comment-body markdown-body js-comment-body" id="pr-md"><p>PR body</p></div></task-lists>
  <form class="js-comment-update"><div class="comment-body markdown-body js-preview-body"></div></form>
</div></div>
<div class="timeline-comment-wrapper timeline-new-comment" id="issuecomment-new">
  <div class="timeline-comment">
    <div class="timeline-comment-actions"><button></button></div>
    <div class="comment-body markdown-body js-preview-body"></div>
  </div>
</div>`;

// 精简自 github.com/orgs/community/discussions/164302：首楼没有锚点 id，顶层评论与回复各自带 discussioncomment- id。
const DISCUSSION = `
<div class="timeline-comment">
  <div class="timeline-comment-actions">
    <div class="d-flex"><comment-actions-container id="op-menu"></comment-actions-container></div>
  </div>
  <table><tbody><tr><td class="comment-body markdown-body js-comment-body" id="op-md"><p>Question</p></td></tr></tbody></table>
</div>
<div id="discussioncomment-1">
  <div class="timeline-comment">
    <div class="timeline-comment-actions">
      <div class="d-flex"><comment-actions-container id="answer-menu"></comment-actions-container></div>
    </div>
    <table><tbody><tr><td class="comment-body markdown-body js-comment-body" id="answer-md"><p>Answer</p></td></tr></tbody></table>
  </div>
  <div id="discussioncomment-2"><div class="review-comment">
    <div class="timeline-comment-actions">
      <div class="d-flex"><comment-actions-container id="reply-menu"></comment-actions-container></div>
    </div>
    <table><tbody><tr><td class="comment-body markdown-body js-comment-body" id="reply-md"><p>Reply</p></td></tr></tbody></table>
  </div></div>
</div>`;

describe('findCommentTargets', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds the React issue body and comments with the outermost markdown body', () => {
    document.body.innerHTML = REACT_ISSUE;
    const targets = findCommentTargets(document);
    expect(targets.map(({ key, anchor, body }) => [key, anchor.id, body.id])).toEqual([
      ['issue-body', 'issue-menu', 'issue-md'],
      ['comment-viewer-outer-box-IC_1', 'comment-menu', 'comment-md'],
    ]);
  });

  it('finds classic PR comments and skips edit previews and the new comment box', () => {
    document.body.innerHTML = CLASSIC_PR;
    const targets = findCommentTargets(document);
    expect(targets.map(({ key, anchor, body }) => [key, anchor.id, body.id])).toEqual([
      ['issuecomment-42', 'pr-menu', 'pr-md'],
    ]);
  });

  it('finds discussion posts and replies and anchors the button beside the options menu', () => {
    document.body.innerHTML = DISCUSSION;
    const targets = findCommentTargets(document);
    expect(targets.map(({ anchor, body }) => [anchor.id, body.id])).toEqual([
      ['op-menu', 'op-md'],
      ['answer-menu', 'answer-md'],
      ['reply-menu', 'reply-md'],
    ]);
    expect(targets.slice(1).map(({ key }) => key)).toEqual(['discussioncomment-1', 'discussioncomment-2']);
  });

  it('ignores markdown inside an existing translation panel', () => {
    document.body.innerHTML = REACT_ISSUE;
    const comment = document.querySelector('#comment-md')!;
    const panel = document.createElement('section');
    panel.className = 'gct-translation';
    panel.innerHTML = '<div data-testid="markdown-body" id="clone"></div>';
    comment.before(panel);
    expect(findCommentTargets(document).map(({ body }) => body.id)).toEqual(['issue-md', 'comment-md']);
  });
});
