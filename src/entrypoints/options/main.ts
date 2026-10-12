import { Braces, Pencil, PlugZap, Plus, Trash, X, createElement } from 'lucide';
import { browser } from 'wxt/browser';
import { GOOGLE_ENGINE, isSameEngine, toProviderRef } from '../../utils/engine';
import { TARGET_LANGUAGES, formatLanguageOption } from '../../utils/languages';
import type { Request, TranslateResponse } from '../../utils/messages';
import { getProviderOriginPattern, parseProviderConfigs } from '../../utils/providers/config';
import { DEFAULT_OLLAMA_BASE_URL } from '../../utils/providers/ollama';
import { DEFAULT_OPENAI_BASE_URL } from '../../utils/providers/openaiCompatible';
import { getErrorMessage, getProviderLabel } from '../../utils/providers/shared';
import { PROVIDER_TYPES, type ProviderSettingsEntry, type ProviderType } from '../../utils/providers/types';
import { loadSettings, settingsItem, type Settings } from '../../utils/settings';
import {
  ADVANCED_FIELDS,
  COMMON_FIELDS,
  emptyFields,
  entryToFields,
  fieldsForType,
  fieldsToRaw,
  type FieldName,
} from './form';
import { removeProvider, replaceProviders, upsertProvider, type ProvidersChange } from './providers-ops';
import './style.css';

const t = (key: string, substitutions?: string | string[]) => browser.i18n.getMessage(key as never, substitutions);

const FIELD_INPUT_TYPE: Partial<Record<FieldName, string>> = {
  api_key: 'password',
  timeout_ms: 'number',
  temperature: 'number',
  top_p: 'number',
  max_tokens: 'number',
};

const FIELD_PLACEHOLDER: Partial<Record<FieldName, string>> = {
  model: 'deepseek-chat',
  base_url: 'https://api.deepseek.com/v1',
  endpoint: 'https://<resource>.openai.azure.com',
  api_version: '2024-10-21',
  timeout_ms: '120000',
  temperature: '0.7',
  top_p: '1',
  max_tokens: '4096',
  headers: '{ "X-Title": "GitHub Comment Translator" }',
};

const VENDOR_PLACEHOLDER: Record<ProviderType, string> = {
  openai: 'OpenAI',
  'openai-compatible': 'DeepSeek',
  openrouter: 'OpenRouter',
  'azure-openai': 'Azure',
  gemini: 'Gemini',
  ollama: 'Ollama',
};

const app = document.querySelector<HTMLElement>('#app')!;
document.documentElement.lang = browser.i18n.getUILanguage();
document.title = t('appName');

/** 页面只展示已保存的设置；所有修改都在用户操作时立即校验并写入存储。 */
let settings: Settings;

void loadSettings().then((loaded) => {
  settings = loaded;
  render();
});

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const { dataset, ...rest } = props;
  const element = Object.assign(document.createElement(tag), rest);
  if (dataset) {
    Object.assign(element.dataset, dataset);
  }
  element.append(...children.filter((child): child is Node | string => !!child));
  return element;
}

function icon(node: Parameters<typeof createElement>[0]): SVGElement {
  return createElement(node, { width: 16, height: 16, 'aria-hidden': 'true', focusable: 'false' });
}

function button(
  label: string,
  onclick: () => void,
  { variant = '', leading }: { variant?: string; leading?: Parameters<typeof createElement>[0] } = {}
): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', className: `btn ${variant}`.trim(), onclick },
    leading && icon(leading),
    h('span', {}, label)
  );
}

function iconButton(
  label: string,
  node: Parameters<typeof createElement>[0],
  onclick: () => void,
  variant = ''
): HTMLButtonElement {
  const element = h(
    'button',
    { type: 'button', className: `icon-btn ${variant}`.trim(), title: label, onclick },
    icon(node)
  );
  element.setAttribute('aria-label', label);
  return element;
}

function render(): void {
  app.replaceChildren(
    h('header', { className: 'page-header' }, h('h1', {}, t('appName')), h('p', { className: 'muted' }, t('appDesc'))),
    renderGeneral(),
    renderProviders()
  );
}

// ---------------------------------------------------------------------------
// 通用设置：修改即保存

function renderGeneral(): HTMLElement {
  const uiLanguage = browser.i18n.getUILanguage();
  // 早先保存的、不在列表中的语言代码也保留为一个选项。
  const codes: string[] = [...TARGET_LANGUAGES];
  if (!codes.includes(settings.target_lang)) {
    codes.unshift(settings.target_lang);
  }
  const targetLang = h(
    'select',
    { id: 'target_lang', onchange: () => void persist({ ...settings, target_lang: targetLang.value }) },
    ...codes.map((code) => h('option', { value: code, textContent: formatLanguageOption(code, uiLanguage) }))
  );
  targetLang.value = settings.target_lang;

  // 下拉选项与引擎按下标一一对应，选项 value 不承载任何标识。
  const engines = [GOOGLE_ENGINE, ...settings.providers.map(toProviderRef)] as const;
  const engine = h(
    'select',
    { id: 'engine', onchange: () => void persist({ ...settings, engine: engines[engine.selectedIndex] }) },
    ...engines.map((choice) =>
      h('option', { textContent: choice === GOOGLE_ENGINE ? 'Google Translate' : getProviderLabel(choice) })
    )
  );
  engine.selectedIndex = Math.max(
    0,
    engines.findIndex((choice) => isSameEngine(choice, settings.engine))
  );

  return h(
    'section',
    { className: 'card' },
    h('h2', {}, t('general')),
    h(
      'div',
      { className: 'grid' },
      field(t('targetLanguage'), targetLang, t('targetLanguageHint')),
      field(t('defaultEngine'), engine, t('defaultEngineHint'))
    )
  );
}

// ---------------------------------------------------------------------------
// AI 服务列表

function renderProviders(): HTMLElement {
  const list = settings.providers.length
    ? h('ul', { className: 'provider-list' }, ...settings.providers.map(renderProviderRow))
    : h('p', { className: 'empty' }, t('noProviders'));

  return h(
    'section',
    { className: 'card' },
    h(
      'div',
      { className: 'card-header' },
      h('h2', {}, t('aiProviders')),
      h(
        'div',
        { className: 'actions' },
        button(t('importExport'), openImportExport, { leading: Braces }),
        button(t('addProvider'), () => openProviderDialog(null), { variant: 'primary', leading: Plus })
      )
    ),
    h('p', { className: 'muted' }, t('aiProvidersHint')),
    list
  );
}

function renderProviderRow(provider: ProviderSettingsEntry, index: number): HTMLElement {
  const result = h('div', { className: 'test-result', role: 'status' });
  const isDefault = isSameEngine(settings.engine, provider);
  return h(
    'li',
    { className: 'provider-row' },
    h(
      'div',
      { className: 'provider-main' },
      h(
        'div',
        { className: 'provider-title' },
        h('span', {}, getProviderLabel(provider)),
        isDefault && h('span', { className: 'badge' }, t('defaultBadge'))
      ),
      h('div', { className: 'provider-meta' }, `${provider.type} · ${describeEndpoint(provider)}`),
      result
    ),
    h(
      'div',
      { className: 'provider-actions' },
      iconButton(t('testProvider'), PlugZap, () => testProvider(fieldsToRaw(entryToFields(provider), index), result)),
      iconButton(t('editProvider'), Pencil, () => openProviderDialog(index)),
      iconButton(
        t('removeProvider'),
        Trash,
        () => {
          if (confirm(t('confirmRemove', getProviderLabel(provider)))) {
            void persist(removeProvider(settings, index), t('removed'));
          }
        },
        'danger'
      )
    )
  );
}

/** 列表里第二行展示接口地址的主机名；省略 base_url 时标注为默认地址。 */
function describeEndpoint(provider: ProviderSettingsEntry): string {
  const url =
    provider.type === 'azure-openai'
      ? provider.endpoint
      : provider.type === 'gemini'
        ? 'https://generativelanguage.googleapis.com'
        : (provider.base_url ??
          (provider.type === 'ollama'
            ? DEFAULT_OLLAMA_BASE_URL
            : provider.type === 'openai'
              ? DEFAULT_OPENAI_BASE_URL
              : ''));
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// 添加 / 编辑弹窗

function openProviderDialog(index: number | null): void {
  const existing = index === null ? undefined : settings.providers[index];
  const fields = existing ? entryToFields(existing) : emptyFields();
  const error = h('div', { className: 'form-error', role: 'alert' });
  const result = h('div', { className: 'test-result', role: 'status' });
  const body = h('div', { className: 'dialog-body' });

  const renderBody = () => {
    body.replaceChildren(
      h('div', { className: 'grid' }, ...[...COMMON_FIELDS, ...fieldsForType(fields.type)].map(providerInput)),
      h(
        'details',
        { className: 'advanced' },
        h('summary', {}, t('advanced')),
        h('div', { className: 'grid' }, ...ADVANCED_FIELDS.map(providerInput))
      )
    );
  };

  const providerInput = (name: FieldName): HTMLElement => {
    const label = t(`field_${name}`) || name;
    if (name === 'type') {
      const select = h(
        'select',
        {
          onchange: () => {
            // 切换类型时保留共有字段，类型相关字段换成新类型的默认值。
            Object.assign(fields, {
              ...emptyFields(select.value as ProviderType),
              vendor: fields.vendor,
              model: fields.model,
              api_key: fields.api_key,
            });
            renderBody();
          },
        },
        ...PROVIDER_TYPES.map((type) => h('option', { value: type, textContent: type }))
      );
      select.value = fields.type;
      return field(label, select);
    }
    if (name === 'headers') {
      const textarea = h('textarea', {
        rows: 3,
        value: fields.headers,
        placeholder: FIELD_PLACEHOLDER.headers,
        spellcheck: false,
        oninput: () => (fields.headers = textarea.value),
      });
      return field(label, textarea, undefined, 'span-2');
    }
    const input = h('input', {
      type: FIELD_INPUT_TYPE[name] ?? 'text',
      value: fields[name],
      placeholder: placeholderFor(fields.type, name),
      spellcheck: false,
      oninput: () => (fields[name] = input.value),
    });
    input.setAttribute('autocomplete', 'off');
    if (name === 'temperature' || name === 'top_p') {
      input.step = '0.1';
    }
    return field(label, input, t(`field_${name}_hint`));
  };

  renderBody();

  const saveButton = button(
    t('save'),
    () => {
      let change: ProvidersChange;
      try {
        change = upsertProvider(settings, index, fieldsToRaw(fields, index ?? settings.providers.length));
      } catch (failure) {
        showFeedback(error, getErrorMessage(failure, t('saveFailed')));
        return;
      }
      submitChange(dialog, saveButton, error, change);
    },
    { variant: 'primary' }
  );

  const dialog = openDialog(
    existing ? t('editProviderTitle', getProviderLabel(existing)) : t('addProviderTitle'),
    h('div', {}, body, error),
    [
      h(
        'div',
        { className: 'footer-start' },
        button(t('testProvider'), () => testProvider(fieldsToRaw(fields, index ?? 0), result), { leading: PlugZap }),
        result
      ),
      button(t('cancel'), () => dialog.close()),
      saveButton,
    ]
  );
}

function placeholderFor(type: ProviderType, name: FieldName): string {
  if (name === 'vendor') {
    return VENDOR_PLACEHOLDER[type];
  }
  if (name === 'base_url' && type === 'openai') {
    return DEFAULT_OPENAI_BASE_URL;
  }
  if (name === 'base_url' && type === 'ollama') {
    return DEFAULT_OLLAMA_BASE_URL;
  }
  if (name === 'model' && type === 'gemini') {
    return 'gemini-2.5-flash';
  }
  return FIELD_PLACEHOLDER[name] ?? '';
}

function field(label: string, control: HTMLElement, hint?: string, className = ''): HTMLElement {
  return h(
    'label',
    { className: `field ${className}`.trim() },
    h('span', { className: 'label' }, label),
    control,
    hint && h('small', {}, hint)
  );
}

// ---------------------------------------------------------------------------
// 导入 / 导出弹窗

function openImportExport(): void {
  const textarea = h('textarea', {
    rows: 14,
    spellcheck: false,
    value: settings.providers.length ? JSON.stringify(settings.providers, null, 2) : '',
    placeholder:
      '[\n  { "vendor": "DeepSeek", "type": "openai-compatible", "base_url": "…", "model": "…", "api_key": "…" }\n]',
  });
  const error = h('div', { className: 'form-error', role: 'alert' });
  const importButton = button(
    t('importReplace'),
    () => {
      let change: ProvidersChange;
      try {
        change = replaceProviders(settings, JSON.parse(textarea.value));
      } catch (failure) {
        showFeedback(error, getErrorMessage(failure, t('invalidJson')));
        return;
      }
      submitChange(dialog, importButton, error, change, t('imported', String(change.settings.providers.length)));
    },
    { variant: 'primary' }
  );
  const dialog = openDialog(
    t('importExport'),
    h('div', { className: 'dialog-body' }, h('p', { className: 'muted' }, t('importExportHint')), textarea, error),
    [
      h(
        'div',
        { className: 'footer-start' },
        button(t('copy'), () => {
          void navigator.clipboard.writeText(textarea.value).then(() => toast(t('copied')));
        })
      ),
      button(t('cancel'), () => dialog.close()),
      importButton,
    ]
  );
}

// ---------------------------------------------------------------------------
// 弹窗、保存、测试、提示

function openDialog(title: string, content: HTMLElement, footer: HTMLElement[]): HTMLDialogElement {
  const dialog = h(
    'dialog',
    { className: 'modal' },
    h(
      'header',
      {},
      h('h2', {}, title),
      iconButton(t('close'), X, () => dialog.close())
    ),
    content,
    h('footer', {}, ...footer)
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector<HTMLElement>('input, select, textarea')?.focus();
  return dialog;
}

/**
 * 弹窗的提交：申请权限期间禁用按钮并提示，避免浏览器授权提示没处理时用户以为没反应、重复点击。
 * saveWithPermission 在第一个 await 之前就调用了 permissions.request，仍处于用户手势内。
 */
function submitChange(
  dialog: HTMLDialogElement,
  submit: HTMLButtonElement,
  feedback: HTMLElement,
  change: ProvidersChange,
  message?: string
): void {
  submit.disabled = true;
  showFeedback(feedback, change.origins.length ? t('waitingForPermission') : '', true);
  void saveWithPermission(change, message).then((saved) => {
    if (saved) {
      dialog.close();
      return;
    }
    submit.disabled = false;
    showFeedback(feedback, '');
  });
}

function showFeedback(element: HTMLElement, message: string, pending = false): void {
  element.classList.toggle('pending', pending);
  element.textContent = message;
}

/** 申请访问权限后写入设置。拒绝授权仍然保存，但提示 AI 服务暂时不可用。 */
async function saveWithPermission(change: ProvidersChange, message = t('saved')): Promise<boolean> {
  const granted = change.origins.length
    ? await browser.permissions.request({ origins: change.origins }).catch(() => false)
    : true;
  return persist(change.settings, granted ? message : t('savedWithoutPermission'), !granted);
}

async function persist(next: Settings, message = t('saved'), isWarning = false): Promise<boolean> {
  try {
    await settingsItem.setValue(next);
  } catch (failure) {
    toast(getErrorMessage(failure, t('saveFailed')), true);
    return false;
  }
  settings = next;
  render();
  toast(message, isWarning);
  return true;
}

function testProvider(raw: Record<string, unknown>, result: HTMLElement): void {
  let origin: string;
  try {
    const [entry] = parseProviderConfigs([raw]);
    origin = getProviderOriginPattern(entry);
  } catch (failure) {
    showResult(result, getErrorMessage(failure, t('saveFailed')), 'error');
    return;
  }
  showResult(result, t('testing'), 'info');
  void browser.permissions
    .request({ origins: [origin] })
    .then(async (granted) => {
      if (!granted) {
        throw new Error(t('permissionDenied', origin));
      }
      const response = await browser.runtime.sendMessage<Request, TranslateResponse>({
        type: 'gct:test-provider',
        provider: raw,
        target_lang: settings.target_lang,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      showResult(result, `✓ ${response.translations[0]}`, 'success');
    })
    .catch((failure: unknown) => showResult(result, getErrorMessage(failure, t('saveFailed')), 'error'));
}

function showResult(element: HTMLElement, message: string, kind: 'info' | 'error' | 'success'): void {
  element.className = `test-result ${kind}`;
  element.textContent = message;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

function toast(message: string, isWarning = false): void {
  let element = document.querySelector<HTMLElement>('.toast');
  if (!element) {
    element = h('div', { className: 'toast', role: 'status' });
    document.body.append(element);
  }
  element.textContent = message;
  element.classList.toggle('warning', isWarning);
  element.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('visible'), isWarning ? 5000 : 2000);
}
