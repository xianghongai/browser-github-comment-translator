import { Braces, Pencil, PlugZap, Plus, RotateCcw, Trash, X, createElement } from 'lucide';
import { browser } from 'wxt/browser';
import { GOOGLE_ENGINE, isSameEngine, toProviderRef } from '../../utils/engine';
import { TARGET_LANGUAGES, formatLanguageOption } from '../../utils/languages';
import type { Request, TranslateResponse } from '../../utils/messages';
import { ConfigError } from '../../utils/config-error';
import { getProviderOriginPattern, parseProviderConfigs, validateProviderConfig } from '../../utils/providers/config';
import { DEFAULT_OLLAMA_BASE_URL } from '../../utils/providers/ollama';
import { DEFAULT_OPENAI_BASE_URL } from '../../utils/providers/openaiCompatible';
import { getErrorMessage, getProviderLabel } from '../../utils/providers/shared';
import { PROVIDER_TYPES, type ProviderSettingsEntry, type ProviderType } from '../../utils/providers/types';
import { loadSettings, settingsItem, type Settings } from '../../utils/settings';
import {
  DEFAULT_VENDOR_PRESETS,
  TYPES_WITH_BASE_URL,
  describeVendorPreset,
  findVendorPreset,
  getVendorPresetOrigin,
  restoreDefaultVendorPresets,
  upsertVendorPreset,
  type VendorPreset,
} from '../../utils/vendors';
import {
  ADVANCED_FIELDS,
  COMMON_FIELDS,
  emptyFields,
  entryToFields,
  fieldsForType,
  fieldsToRaw,
  type FieldName,
} from './form';
import { exportConfig, importConfig, removeProvider, upsertProvider, type ProvidersChange } from './providers-ops';
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
  base_url: 'https://api.deepseek.com',
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
    renderProviders(),
    renderVendors()
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
      h('div', { className: 'provider-meta' }, describeEndpoint(provider)),
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

/** 列表里第二行展示类型和接口地址的主机名；省略 base_url 时展示默认地址。厂商预设没有 Azure 的 endpoint，只展示类型。 */
function describeEndpoint({
  type,
  base_url,
  endpoint,
}: {
  type: ProviderType;
  base_url?: string;
  endpoint?: string;
}): string {
  const url =
    type === 'azure-openai'
      ? endpoint
      : type === 'gemini'
        ? 'https://generativelanguage.googleapis.com'
        : (base_url ??
          (type === 'ollama' ? DEFAULT_OLLAMA_BASE_URL : type === 'openai' ? DEFAULT_OPENAI_BASE_URL : ''));
  if (!url) {
    return type;
  }
  try {
    return `${type} · ${new URL(url).host}`;
  } catch {
    return `${type} · ${url}`;
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

  // 厂商用下拉选预设，选「自定义」再输入；Base URL 可以从预设里选，也可以自己输入。
  let customVendor = !findVendorPreset(settings.vendors, fields.vendor);
  const baseUrlOptions = h(
    'datalist',
    { id: 'base-url-presets' },
    ...settings.vendors
      .filter((preset) => preset.base_url)
      .map((preset) => h('option', { value: preset.base_url!, label: preset.vendor }))
  );

  const renderBody = () => {
    body.replaceChildren(
      baseUrlOptions,
      h('div', { className: 'grid' }, ...[...COMMON_FIELDS, ...fieldsForType(fields.type)].map(providerInput)),
      h(
        'details',
        { className: 'advanced' },
        h('summary', {}, t('advanced')),
        h('div', { className: 'grid' }, ...ADVANCED_FIELDS.map(providerInput))
      )
    );
  };

  /** 选中预设时套用它的厂商、类型和 Base URL；模型、API Key 保留。 */
  const applyVendorPreset = (preset: VendorPreset) => {
    if (preset.type !== fields.type) {
      Object.assign(fields, { ...emptyFields(preset.type), model: fields.model, api_key: fields.api_key });
    }
    fields.vendor = preset.vendor;
    fields.base_url = preset.base_url ?? emptyFields(preset.type).base_url;
  };

  /** 与类型一样用原生下拉；第一项「自定义」展开输入框，填写预设以外的厂商名。 */
  const vendorInput = (label: string): HTMLElement => {
    const select = h(
      'select',
      {
        name: 'vendor-preset',
        onchange: () => {
          const preset = select.selectedIndex > 0 ? settings.vendors[select.selectedIndex - 1] : undefined;
          customVendor = !preset;
          if (preset) {
            applyVendorPreset(preset);
          }
          renderBody();
          if (customVendor) {
            body.querySelector<HTMLInputElement>('input[name="vendor"]')?.focus();
          }
        },
      },
      h('option', { textContent: t('customVendor') }),
      ...settings.vendors.map((preset) => h('option', { textContent: preset.vendor }))
    );
    const presetIndex = customVendor
      ? -1
      : settings.vendors.findIndex((preset) => preset === findVendorPreset(settings.vendors, fields.vendor));
    select.selectedIndex = presetIndex + 1;
    if (!customVendor) {
      return field(label, select, t('field_vendor_hint'));
    }
    const input = h('input', {
      name: 'vendor',
      type: 'text',
      value: fields.vendor,
      placeholder: placeholderFor(fields.type, 'vendor'),
      spellcheck: false,
      oninput: () => (fields.vendor = input.value),
    });
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', label);
    return field(label, h('div', { className: 'stack' }, select, input), t('field_vendor_hint'));
  };

  const providerInput = (name: FieldName): HTMLElement => {
    const label = t(`field_${name}`) || name;
    if (name === 'vendor') {
      return vendorInput(label);
    }
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
      name,
      type: FIELD_INPUT_TYPE[name] ?? 'text',
      value: fields[name],
      placeholder: placeholderFor(fields.type, name),
      spellcheck: false,
      oninput: () => (fields[name] = input.value),
    });
    input.setAttribute('autocomplete', 'off');
    if (name === 'base_url') {
      input.setAttribute('list', baseUrlOptions.id);
    }
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
        showFeedback(error, describeFailure(failure, t('saveFailed')));
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
// 厂商预设：只有厂商、类型和 Base URL，模型更新太频繁，不做预设

function renderVendors(): HTMLElement {
  const list = settings.vendors.length
    ? h('ul', { className: 'provider-list' }, ...settings.vendors.map(renderVendorRow))
    : h('p', { className: 'empty' }, t('noVendors'));

  return h(
    'section',
    { className: 'card' },
    h(
      'div',
      { className: 'card-header' },
      h('h2', {}, t('vendorPresets')),
      h(
        'div',
        { className: 'actions' },
        button(t('restoreVendors'), restoreVendors, { leading: RotateCcw }),
        button(t('addVendor'), () => openVendorDialog(null), { leading: Plus })
      )
    ),
    h('p', { className: 'muted' }, t('vendorPresetsHint')),
    h(
      'details',
      { className: 'vendor-presets' },
      h('summary', {}, t('vendorCount', String(settings.vendors.length))),
      list
    )
  );
}

/** 预设来源的标记：默认（未改动的内置预设）、已修改（「恢复内置预设」会改回默认值）、自定义。 */
function vendorOriginBadge(preset: VendorPreset): HTMLElement {
  const origin = getVendorPresetOrigin(preset);
  const badge = h('span', {
    className: `badge ${origin}`,
    textContent: t(origin === 'built-in' ? 'builtInBadge' : origin === 'edited' ? 'editedBadge' : 'customBadge'),
  });
  if (origin === 'edited') {
    badge.title = t('editedBadgeTitle', describeVendorPreset(findVendorPreset(DEFAULT_VENDOR_PRESETS, preset.vendor)!));
  }
  return badge;
}

function renderVendorRow(preset: VendorPreset, index: number): HTMLElement {
  return h(
    'li',
    { className: 'provider-row' },
    h(
      'div',
      { className: 'provider-main' },
      h('div', { className: 'provider-title' }, h('span', {}, preset.vendor), vendorOriginBadge(preset)),
      h('div', { className: 'provider-meta' }, describeEndpoint(preset))
    ),
    h(
      'div',
      { className: 'provider-actions' },
      iconButton(t('editProvider'), Pencil, () => openVendorDialog(index)),
      iconButton(
        t('removeProvider'),
        Trash,
        () => {
          if (confirm(t('confirmRemove', preset.vendor))) {
            const vendors = settings.vendors.filter((_, position) => position !== index);
            void persist({ ...settings, vendors }, t('removed')).then(keepVendorsOpen);
          }
        },
        'danger'
      )
    )
  );
}

/** 列表重新渲染后保持展开，方便连续编辑。 */
function keepVendorsOpen(): void {
  app.querySelector<HTMLDetailsElement>('details.vendor-presets')?.setAttribute('open', '');
}

/** 补回缺少的内置预设；会覆盖用户改过的内置预设时，先列出改动让用户确认。 */
function restoreVendors(): void {
  const { presets, added, reset } = restoreDefaultVendorPresets(settings.vendors);
  if (!added.length && !reset.length) {
    toast(t('vendorsUpToDate'));
    return;
  }
  if (reset.length) {
    const changes = reset.map(
      ({ from, to }) => `${from.vendor}\n  ${describeVendorPreset(from)}\n  → ${describeVendorPreset(to)}`
    );
    if (!confirm(`${t('confirmRestoreVendors')}\n\n${changes.join('\n')}`)) {
      return;
    }
  }
  void persist(
    { ...settings, vendors: presets },
    t('vendorsRestored', [String(added.length), String(reset.length)])
  ).then(keepVendorsOpen);
}

function openVendorDialog(index: number | null): void {
  const existing = index === null ? undefined : settings.vendors[index];
  const fields = {
    vendor: existing?.vendor ?? '',
    type: existing?.type ?? 'openai-compatible',
    base_url: existing?.base_url ?? '',
  };
  const error = h('div', { className: 'form-error', role: 'alert' });
  const body = h('div', { className: 'grid' });

  const renderBody = () => {
    const vendor = h('input', {
      type: 'text',
      value: fields.vendor,
      placeholder: VENDOR_PLACEHOLDER[fields.type],
      spellcheck: false,
      oninput: () => (fields.vendor = vendor.value),
    });
    vendor.setAttribute('autocomplete', 'off');
    const type = h(
      'select',
      {
        onchange: () => {
          fields.type = type.value as ProviderType;
          renderBody();
        },
      },
      ...PROVIDER_TYPES.map((value) => h('option', { value, textContent: value }))
    );
    type.value = fields.type;
    const baseUrl = h('input', {
      type: 'text',
      value: fields.base_url,
      placeholder: placeholderFor(fields.type, 'base_url'),
      spellcheck: false,
      oninput: () => (fields.base_url = baseUrl.value),
    });
    baseUrl.setAttribute('autocomplete', 'off');
    body.replaceChildren(
      field(t('field_vendor'), vendor),
      field(t('field_type'), type),
      ...(TYPES_WITH_BASE_URL.includes(fields.type) ? [field(t('field_base_url'), baseUrl, undefined, 'span-2')] : [])
    );
  };
  renderBody();

  const dialog = openDialog(
    existing ? t('editProviderTitle', existing.vendor) : t('addVendorTitle'),
    h('div', { className: 'dialog-body' }, body, error),
    [
      button(t('cancel'), () => dialog.close()),
      button(
        t('save'),
        () => {
          let vendors: VendorPreset[];
          try {
            vendors = upsertVendorPreset(settings.vendors, index, fields);
          } catch (failure) {
            showFeedback(error, describeFailure(failure, t('saveFailed')));
            return;
          }
          void persist({ ...settings, vendors }).then((saved) => {
            if (saved) {
              dialog.close();
              keepVendorsOpen();
            }
          });
        },
        { variant: 'primary' }
      ),
    ]
  );
}

// ---------------------------------------------------------------------------
// 导入 / 导出弹窗

function openImportExport(): void {
  const textarea = h('textarea', {
    rows: 14,
    spellcheck: false,
    value: JSON.stringify(exportConfig(settings), null, 2),
    placeholder: t('importPlaceholder'),
  });
  const error = h('div', { className: 'form-error', role: 'alert' });
  const importButton = button(
    t('importReplace'),
    () => {
      let change: ProvidersChange | undefined;
      try {
        change = importConfig(settings, JSON.parse(textarea.value));
      } catch (failure) {
        // JSON 不完整（例如没复制全）只提示重新粘贴；内容能解析但某个服务有问题时，给出具体原因。
        showFeedback(
          error,
          failure instanceof SyntaxError ? t('invalidImport') : describeFailure(failure, t('invalidImport'), true)
        );
        return;
      }
      if (!change) {
        showFeedback(error, t('invalidImport'));
        return;
      }
      submitChange(dialog, importButton, error, change, t('imported'));
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

/**
 * 把配置校验错误换成面向用户的提示，例如「请填写模型」「这个厂商和模型已经添加过了」。
 * inList 为 true（导入）时注明是第几个服务或预设；其它错误原样显示。
 */
function describeFailure(failure: unknown, fallback: string, inList = false): string {
  if (!(failure instanceof ConfigError)) {
    return getErrorMessage(failure, fallback);
  }
  const { code, scope, index, field } = failure.issue;
  const label = field ? t(`field_${field}`) || field : '';
  const message =
    code === 'duplicate'
      ? t(scope === 'vendor' ? 'vendorDuplicate' : 'providerDuplicate')
      : code === 'required'
        ? t('configRequired', label)
        : code === 'url'
          ? t('configInvalidUrl', label)
          : label
            ? t('configInvalid', label)
            : fallback;
  return inList && index !== undefined
    ? t(scope === 'vendor' ? 'importVendorItem' : 'importProviderItem', [String(index + 1), message])
    : message;
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
    // 测试前先检查 API Key，缺失时直接给出提示，不必等后台返回。
    validateProviderConfig(entry);
    origin = getProviderOriginPattern(entry);
  } catch (failure) {
    showResult(result, describeFailure(failure, t('saveFailed')), 'error');
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
