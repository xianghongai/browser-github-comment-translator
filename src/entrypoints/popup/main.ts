import { Settings as SettingsIcon, createElement } from 'lucide';
import { browser } from 'wxt/browser';
import { GOOGLE_ENGINE, isSameEngine, toProviderRef, type Engine } from '../../utils/engine';
import { TARGET_LANGUAGES, formatLanguageOption } from '../../utils/languages';
import { getProviderLabel } from '../../utils/providers/shared';
import { loadSettings, settingsItem, type Settings } from '../../utils/settings';
import './style.css';

const t = (key: string, substitutions?: string | string[]) => browser.i18n.getMessage(key as never, substitutions);

const app = document.querySelector<HTMLElement>('#app')!;
document.documentElement.lang = browser.i18n.getUILanguage();
document.title = t('appName');

/** 弹出框只改所有评论共用的设置：默认引擎和目标语言，修改即保存；其余设置在 options 页。 */
let settings: Settings;

void loadSettings().then((loaded) => {
  settings = loaded;
  render();
});

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children.filter((child): child is Node | string => !!child));
  return element;
}

function icon(node: Parameters<typeof createElement>[0]): HTMLElement {
  return h(
    'span',
    { className: 'item-icon' },
    createElement(node, { width: 16, height: 16, 'aria-hidden': 'true', focusable: 'false' })
  );
}

function render(): void {
  app.replaceChildren(
    renderEngines(),
    renderTargetLanguage(),
    h('div', { className: 'divider', role: 'separator' }),
    renderSettingsLink()
  );
}

function renderEngines(): HTMLElement {
  // 下拉选项与引擎按下标一一对应，选项 value 不承载任何标识。
  const engines: Engine[] = [GOOGLE_ENGINE, ...settings.providers.map(toProviderRef)];
  const select = h(
    'select',
    { id: 'engine', onchange: () => void persist({ ...settings, engine: engines[select.selectedIndex] }) },
    ...engines.map((engine) =>
      h('option', { textContent: engine === GOOGLE_ENGINE ? 'Google Translate' : getProviderLabel(engine) })
    )
  );
  select.selectedIndex = Math.max(
    0,
    engines.findIndex((engine) => isSameEngine(engine, settings.engine))
  );
  return h(
    'section',
    {},
    h('label', { className: 'heading', htmlFor: 'engine', textContent: t('translationEngine') }),
    select,
    !settings.providers.length && h('p', { className: 'hint', textContent: t('noProviders') })
  );
}

function renderTargetLanguage(): HTMLElement {
  const uiLanguage = browser.i18n.getUILanguage();
  // 早先保存的、不在列表中的语言代码也保留为一个选项。
  const codes: string[] = [...TARGET_LANGUAGES];
  if (!codes.includes(settings.target_lang)) {
    codes.unshift(settings.target_lang);
  }
  const select = h(
    'select',
    { id: 'target_lang', onchange: () => void persist({ ...settings, target_lang: select.value }) },
    ...codes.map((code) => h('option', { value: code, textContent: formatLanguageOption(code, uiLanguage) }))
  );
  select.value = settings.target_lang;
  return h(
    'section',
    {},
    h('label', { className: 'heading', htmlFor: 'target_lang', textContent: t('targetLanguage') }),
    select
  );
}

function renderSettingsLink(): HTMLElement {
  return h(
    'button',
    {
      type: 'button',
      className: 'item',
      onclick: () => {
        void browser.runtime.openOptionsPage();
        window.close();
      },
    },
    icon(SettingsIcon),
    h('span', { className: 'item-label', textContent: t('settings') })
  );
}

async function persist(next: Settings): Promise<void> {
  await settingsItem.setValue(next);
  settings = next;
  render();
}
