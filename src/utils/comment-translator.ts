import { Globe, LoaderCircle, createElement } from 'lucide';
import { browser } from 'wxt/browser';
import { TRANSLATION_CLASS, UI_CLASS, findCommentTargets, type CommentTarget } from './adapters';
import type { Request, TranslateResponse } from './messages';
import { applyTranslation, collectSegments } from './segments';

type Status = 'idle' | 'loading' | 'shown' | 'hidden' | 'error';

interface CommentState {
  body: HTMLElement;
  /** 翻译时原文的文本，用来判断重新挂载的正文是否被编辑过。 */
  sourceText?: string;
  /** 当前译文所用引擎，显示在按钮的提示里。 */
  engineLabel?: string;
  status: Status;
  /** 每次翻译自增；旧请求返回时若已被新请求取代就丢弃结果。 */
  requestId: number;
  ui: ActionsUI;
  panel?: TranslationPanel;
}

interface ActionsUI {
  root: HTMLElement;
  button: HTMLButtonElement;
}

/** 面板只放译文；message 仅在出错或无内容可译时出现。 */
interface TranslationPanel {
  root: HTMLElement;
  message: HTMLElement;
  content: HTMLElement;
}

const t = (key: string, substitutions?: string | string[]) => browser.i18n.getMessage(key as never, substitutions);

function icon(node: Parameters<typeof createElement>[0]): SVGElement {
  return createElement(node, { width: 16, height: 16, 'aria-hidden': 'true', focusable: 'false' });
}

export class CommentTranslator {
  /** 按评论的稳定 ID 保存状态：GitHub 的 React 时间线会整块重新挂载评论元素。 */
  private readonly states = new Map<string, CommentState>();
  private path = location.pathname;
  private scanScheduled = false;

  start(): void {
    this.scan();
    const observer = new MutationObserver(() => this.scheduleScan());
    observer.observe(document.body, { childList: true, subtree: true });
    // Turbo 导航会整体替换 body 内容，MutationObserver 仍然能感知；这里额外兜底一次。
    document.addEventListener('turbo:load', () => this.scheduleScan());
  }

  private scheduleScan(): void {
    if (this.scanScheduled) {
      return;
    }
    this.scanScheduled = true;
    requestAnimationFrame(() => {
      this.scanScheduled = false;
      this.scan();
    });
  }

  private scan(): void {
    if (this.path !== location.pathname) {
      this.path = location.pathname;
      this.states.clear();
    }
    for (const target of findCommentTargets(document)) {
      this.attach(target);
    }
  }

  /** 给评论挂上按钮；评论被重新挂载时复用原有状态，把按钮和译文接回新的 DOM。 */
  private attach(target: CommentTarget): void {
    let state = this.states.get(target.key);
    if (!state) {
      state = { body: target.body, status: 'idle', requestId: 0, ui: undefined! };
      state.ui = this.createActions(state);
      this.states.set(target.key, state);
    }
    if (state.body !== target.body) {
      state.body = target.body;
      if (state.panel && state.sourceText !== normalizedText(target.body)) {
        // 评论被编辑过，旧译文已过时。
        state.requestId++;
        state.panel.root.remove();
        state.panel = undefined;
        this.setStatus(state, 'idle');
      }
    }
    // 只在按钮/译文脱离原位置时才重新插入；不要求紧挨着，避免与其他插入同一位置的脚本互相挤占、反复重排。
    if (state.ui.root.parentElement !== target.anchor.parentElement) {
      target.anchor.before(state.ui.root);
    }
    if (state.panel && state.panel.root.parentElement !== state.body.parentElement) {
      state.body.after(state.panel.root);
    }
  }

  private createActions(state: CommentState): ActionsUI {
    const root = document.createElement('span');
    root.className = UI_CLASS;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gct-button';
    button.append(icon(Globe));
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggle(state);
    });

    root.append(button);
    const ui = { root, button };
    this.renderButton(ui, 'idle');
    return ui;
  }

  private renderButton(ui: ActionsUI, status: Status, engineLabel?: string): void {
    const action =
      status === 'loading'
        ? t('translating')
        : status === 'shown'
          ? t('hideTranslation')
          : status === 'hidden'
            ? t('showTranslation')
            : t('translate');
    const label = engineLabel && (status === 'shown' || status === 'hidden') ? `${action} · ${engineLabel}` : action;
    ui.button.setAttribute('aria-label', label);
    ui.button.title = label;
    ui.button.setAttribute('aria-pressed', String(status === 'shown'));
    ui.button.disabled = status === 'loading';
    ui.button.replaceChildren(icon(status === 'loading' ? LoaderCircle : Globe));
    ui.button.classList.toggle('gct-loading', status === 'loading');
  }

  private setStatus(state: CommentState, status: Status): void {
    state.status = status;
    this.renderButton(state.ui, status, state.engineLabel);
  }

  /** 主按钮：未翻译时用默认引擎翻译；已翻译时在隐藏/显示之间切换，编辑过的译文保留。 */
  private toggle(state: CommentState): void {
    switch (state.status) {
      case 'shown':
        state.panel!.root.hidden = true;
        this.setStatus(state, 'hidden');
        return;
      case 'hidden':
        state.panel!.root.hidden = false;
        this.setStatus(state, 'shown');
        return;
      case 'loading':
        return;
      default:
        void this.translate(state);
    }
  }

  /** 翻译期间只让按钮转圈；已有译文时保留旧译文直到新结果返回。 */
  private async translate(state: CommentState): Promise<void> {
    const requestId = ++state.requestId;
    this.setStatus(state, 'loading');

    state.sourceText = normalizedText(state.body);
    const content = cloneBody(state.body);
    const segments = collectSegments(content);
    if (!segments.length) {
      this.showMessage(state, t('nothingToTranslate'), false);
      return;
    }

    let response: TranslateResponse | undefined;
    try {
      response = await browser.runtime.sendMessage<Request, TranslateResponse>({
        type: 'gct:translate',
        texts: segments.map(({ text }) => text),
      });
    } catch (error) {
      response = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (requestId !== state.requestId) {
      return;
    }
    if (!response?.ok) {
      this.showMessage(state, t('translationFailed', response?.error ?? ''), true);
      return;
    }

    segments.forEach((segment, index) => applyTranslation(segment, response.translations[index] ?? segment.text));
    const panel = this.ensurePanel(state);
    panel.root.hidden = false;
    panel.root.dataset.state = 'done';
    panel.message.hidden = true;
    panel.message.replaceChildren();
    panel.content.hidden = false;
    panel.content.replaceChildren(...Array.from(content.childNodes));
    state.engineLabel = response.engineLabel;
    this.setStatus(state, 'shown');
  }

  private showMessage(state: CommentState, message: string, isError: boolean) {
    const panel = this.ensurePanel(state);
    panel.root.hidden = false;
    panel.root.dataset.state = isError ? 'error' : 'empty';
    panel.content.hidden = true;
    panel.message.hidden = false;
    panel.message.replaceChildren(text(message));
    if (isError) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'gct-link-button';
      retry.textContent = t('retry');
      retry.addEventListener('click', () => void this.translate(state));
      panel.message.append(retry);
    }
    this.setStatus(state, isError ? 'error' : 'idle');
    if (!isError) {
      setTimeout(() => {
        if (state.status === 'idle' && state.panel === panel && panel.root.dataset.state === 'empty') {
          panel.root.remove();
          state.panel = undefined;
        }
      }, 3000);
    }
  }

  private ensurePanel(state: CommentState): TranslationPanel {
    const panel = state.panel ?? this.createPanel();
    state.panel = panel;
    if (panel.root.parentElement !== state.body.parentElement) {
      state.body.after(panel.root);
    }
    return panel;
  }

  private createPanel(): TranslationPanel {
    const root = document.createElement('section');
    root.className = TRANSLATION_CLASS;
    const message = document.createElement('div');
    message.className = 'gct-message';
    message.setAttribute('role', 'status');
    message.hidden = true;
    const content = document.createElement('div');
    content.className = 'gct-content markdown-body';
    content.setAttribute('role', 'textbox');
    content.setAttribute('aria-multiline', 'true');
    content.setAttribute('aria-label', t('editableTranslation'));
    makeTemporarilyEditable(content);
    root.append(message, content);
    return { root, message, content };
  }
}

function normalizedText(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function text(value: string): Text {
  return document.createTextNode(value);
}

/** 克隆正文用于渲染译文：去掉 id（避免锚点重复）、禁用任务列表复选框、去掉 GitHub 的 js- 行为钩子和复制按钮。 */
function cloneBody(body: HTMLElement): HTMLElement {
  const clone = body.cloneNode(true) as HTMLElement;
  for (const element of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
    element.removeAttribute('id');
    for (const name of Array.from(element.classList)) {
      if (name.startsWith('js-')) {
        element.classList.remove(name);
      }
    }
  }
  for (const input of Array.from(clone.querySelectorAll('input'))) {
    input.disabled = true;
  }
  // 代码块与原文完全相同，复制按钮克隆后失去样式和行为，直接去掉。
  clone
    .querySelectorAll(`.${UI_CLASS}, .${TRANSLATION_CLASS}, .zeroclipboard-container, clipboard-copy`)
    .forEach((node) => node.remove());
  return clone;
}

/**
 * 译文区可以直接修改（只在当前页面生效，不保存）。
 * - 拦截键盘事件冒泡，避免触发 GitHub 的 j/k/r 等快捷键；
 * - 粘贴只插入纯文本；
 * - 链接普通点击用于编辑，按住 Ctrl/⌘ 点击才打开。
 */
function makeTemporarilyEditable(content: HTMLElement): void {
  // 不用 plaintext-only：Chrome 会对它强制 white-space: pre-wrap，标签间的换行会撑开段落、拆散表格。
  content.contentEditable = 'true';
  content.spellcheck = false;
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    content.addEventListener(type, (event) => event.stopPropagation());
  }
  content.addEventListener('paste', (event) => {
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '');
  });
  content.addEventListener('click', (event) => {
    const link = (event.target as Element).closest('a[href]');
    if (!link || !content.contains(link)) {
      return;
    }
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      window.open((link as HTMLAnchorElement).href, '_blank', 'noopener');
    }
  });
}
